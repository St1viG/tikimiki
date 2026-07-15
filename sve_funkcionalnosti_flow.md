<!-- Autor: Dimitrije Pesic (2023/0014) -->

# Sve funkcionalnosti — prirodan flow, testiranje i fixevi

Datum testiranja: **14–15. jul 2026.** Testirano na živom sistemu (backend `localhost:4000/api/v1`,
frontend `localhost:3000`, Postgres + Redis u dockeru). Sve ispod je izvedeno **redom, kao prirodan
korisnički tok** — od registracije do proglašenja pobednika — uz limit testove na svakom koraku.
Protok vremena (rok prijave, početak i kraj hakatona) simuliran je pomeranjem timestampova u bazi,
a sve tranzicije je odradio pravi scheduler, ne ručni SQL.

Demo nalozi: `admin@ / org@ / andrej@ / nenad@ / mara@ / fenjer@tikimiki.dev` (lozinka `password123`),
plus `flowtester@tikimiki.dev` (`Password123!`) registrovan tokom ovog testa kroz API.

---

## 1. Glavni hackathon flow (ono najbitnije)

Pitanje koje je vodilo test: _„Da li te prihvaćena prijava ubaci na hakaton kad krene, da li
organizatori posle isteka roka pregledaju projekte i proglašavaju pobednike, i da li se pobede
beleže na platformi?"_ — **Sada DA, kompletno.** Koraci kako je testirano:

| #   | Korak                                       | Kako je testirano                                                                               | Rezultat                                                                                                                                                                                                                               |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Registracija člana                          | `POST /auth/register` (flowtester)                                                              | ✅ nalog + email verifikacija (dev link) + `POST /auth/verify-email/confirm`                                                                                                                                                           |
| 2   | Org kreira hakaton                          | `POST /hackathons` („Flow Test Hakaton 2026", virtual, max 4 učesnika, custom pitanje na formi) | ✅ hakaton + cohor server + kanali se kreiraju automatski                                                                                                                                                                              |
| 3   | Prijave (5 korisnika)                       | `POST /applications` sa odgovorima na obavezno pitanje                                          | ✅ svih 5 pending; organizator dobija notifikaciju                                                                                                                                                                                     |
| 4   | Limit: dupla prijava                        | ponovni `POST /applications`                                                                    | ✅ `409 You already have an active application`                                                                                                                                                                                        |
| 5   | Limit: prazan obavezan odgovor              | prijava bez odgovora                                                                            | ✅ `400 All required questions must be answered`                                                                                                                                                                                       |
| 6   | Povlačenje prijave                          | `PATCH /applications/:id/withdraw` pa ponovna prijava                                           | ✅ withdrawn → nova prijava prolazi                                                                                                                                                                                                    |
| 7   | Odobravanje                                 | `PATCH /applications/:id/approve` ×4                                                            | ✅ approved + notifikacija „Prijava odobrena 🎉" + email + **automatski Participant pristup cohor serveru**                                                                                                                            |
| 8   | Limit: 5. odobrenje preko maxParticipants=4 | approve 5. prijave                                                                              | 🔴 **BUG NAĐEN pa FIXED** — ranije prolazilo, sada `400 Hackathon is full`                                                                                                                                                             |
| 9   | Odbijanje sa razlogom                       | `PATCH /applications/:id/reject`                                                                | ✅ rejected + notifikacija sa razlogom                                                                                                                                                                                                 |
| 10  | Formiranje tima                             | `POST /teams` + pozivnice + accept (andrej+nenad+mara)                                          | ✅ tim od 3 člana                                                                                                                                                                                                                      |
| 11  | Limit: 4. član preko maxTeamSize=3          | pozivnica + accept                                                                              | ✅ `400 Team is full`                                                                                                                                                                                                                  |
| 12  | **Hakaton počinje**                         | `starts_at` pomeren u prošlost                                                                  | 🔴 **BUG NAĐEN pa FIXED** — ništa nije prebacivalo `upcoming→ongoing`; scheduler sada auto-startuje. `GET /me/active-hackathon` vraća hakaton + serverId → učesnik je „ubačen" na hakaton (kartica u desnom railu vodi u cohor server) |
| 13  | Limit: prijava posle roka                   | `POST /applications`                                                                            | ✅ `400 Registration is closed`                                                                                                                                                                                                        |
| 14  | Predaja projekta                            | `POST /teams/:id/project` + `POST /projects/:id/submit` (2 tima)                                | ✅ submitted                                                                                                                                                                                                                           |
| 15  | Glasanje publike                            | org otvori prozor (novi endpoint), član + **gost** glasaju                                      | ✅ (detalji u §3)                                                                                                                                                                                                                      |
| 16  | **Rok ističe**                              | `ends_at` pomeren u prošlost                                                                    | ✅ scheduler auto-završava (`ongoing→finished`)                                                                                                                                                                                        |
| 17  | Limit: predaja posle roka                   | withdraw → submit                                                                               | ✅ `400 The submission period has ended`                                                                                                                                                                                               |
| 18  | Limit: učesnik objavljuje rezultate         | `POST /hackathons/:id/results` kao učesnik                                                      | ✅ `403 Only the organizing team can manage this hackathon`                                                                                                                                                                            |
| 19  | **Organizator proglašava pobednike**        | `POST /hackathons/:id/results` (1. i 2. mesto)                                                  | ✅ podijum upisan                                                                                                                                                                                                                      |
| 20  | **Pobede se BELEŽE**                        | provera baze + API                                                                              | ✅ **5000 poena** (1. mesto) / **3000** (2. mesto) svakom članu tima, bedž **„Pobednik"**, notifikacija `hackathon_result_posted` svim učesnicima, leaderboard ažuriran (pobednici na vrhu), profil prikazuje poene + bedževe          |
| 21  | Idempotentnost                              | ponovni publish istih rezultata                                                                 | ✅ poeni se NE dupliraju (i dalje 1 transakcija po korisniku)                                                                                                                                                                          |
| 22  | Sponzorski bounty                           | novi CRUD + winner (detalji §3)                                                                 | ✅ 1000 poena po članu + bedž + notifikacija `bounty_result_posted`                                                                                                                                                                    |

## 2. Fixevi urađeni tokom testiranja (sve NEkomitovano, po dogovoru bez pusha)

### Glavni flow

1. **Scheduler auto-start** (`backend/src/hackathons/hackathons-status.scheduler.ts`) — `upcoming→ongoing`
   kad prođe `startsAt` (uz postojeći auto-finish; + backstop `upcoming→finished` za preskočene).
   Bez ovoga „aktivni hakaton" kartica i auto-ulazak u server nikad ne rade prirodnim tokom.
2. **maxParticipants na approve** (`applications.service.ts`) — odobravanje preko kapaciteta sada baca
   `400 Hackathon is full` (SSU11). Potvrđeno testom pre/posle.
3. **„Odobri tim" zaista odobrava tim** — novi endpoint `PATCH /applications/:id/approve-team`
   (odobrava sve otvorene prijave tima uz zbirnu proveru kapaciteta) + FE dugme u `CandidatePopup`
   sada zove taj endpoint i popunjava listu članova tima realnim podacima. Testirano: tim od 2 → obe
   prijave approved jednim klikom.
4. **Timska prijava sa FE koristi `POST /applications/team`** (`ApplyHackathonClient.tsx`) — ranije je
   slala samo prijavu pozivaoca; sada kreira prijavu za svakog aktivnog člana tima (SSU10). Testirano
   kroz API: tim od 2 → 2 prijave.
5. **Rezultati forma u cohor-u koristila HARDKODOVANA imena timova** (`shared.ts TEAM_OPTIONS`) pa se
   `publishResults` realno nikad nije pozivao sa pravim timovima — dropdownovi (1/2/3. mesto, publika,
   bounty pobednici) sada se pune iz realno predatih projekata (`RezSelect options` + `realTeamOptions`).
6. **Pobednici su sada JAVNO vidljivi** — `HackathonDetailClient` prikazuje objavljen podijum
   (🥇🥈🥉 tim + projekat) i sponzorske nagrade na javnoj stranici hakatona (ranije nigde van cohor kanala).
7. **FE gating predaje na rok** (`CohorClient`) — dugme „Predaj projekat" se gasi kad hakaton nije aktivan
   (backend je i ranije enforcovao rok; sada i UI to poštuje umesto da klik pukne).

### SSU14 — glasanje

8. **Gost može da glasa** — `POST /hackathons/:id/projects/:projectId/vote` više ne zahteva login:
   gost šalje `fingerprint` (čuva se u `localStorage`), šema `voterFingerprint` + unique indeks su
   konačno u upotrebi. Limit testovi: dupli glas gosta → `409`; bez fingerprinta → `400`; van
   prozora → `403 Voting is not open`. Član i dalje glasa nalogom (1 glas po hakatonu).
9. **Prozor za glasanje se može podesiti** — novi `PATCH /hackathons/:id/voting-window` (org/admin,
   validacija opensAt<closesAt). Ranije kolone postojale, API nije.
10. **Javna sekcija glasanja** na stranici hakatona (`HackathonDetailClient`) — lista projekata sa
    brojem glasova i dugmetom „Glasaj" dok je prozor otvoren; radi i za goste.

### SSU16 — bounties

11. **Bounty CRUD za organizatora** — `POST/PATCH/DELETE /hackathons/:id/bounties[/:bountyId]`
    (+ automatski prize red uz `prizeAward`). Ranije su bounti postojali samo iz seed-a.
12. **setBountyWinner proverava prijavu na bounty** — pobednik koji nije apliciran na taj bounty →
    `400 The winning project has not applied to this bounty`. Testirano pre/posle prijave.

### SSU8/9 — realtime + kanban

13. **WebSocket sobe sada proveravaju članstvo** (`realtime.gateway.ts`) — `joinChannel/joinServer/
joinConversation/joinKanban` više ne puštaju bilo koga sa pogodnim ID-jem; proverava se članstvo
    servera / konverzacije / tima (odn. organizator/admin).
14. **Kanban kolone na srpskom** — seed sada pravi „Za uraditi / U toku / Završeno", postojeće kolone
    u bazi preimenovane, a UI mapira i stara engleska imena na prevode (custom imena ostaju kakva jesu).

### SSU13 — video

15. **UI limit usklađen sa backendom: 50MB** (ranije je UI tvrdio 500MB pa upload pucao na serveru).
16. **Stari video se briše sa diska** pri zameni/uklanjanju (`projects.service` — best-effort `unlink`,
    zaštita od path traversala).

### SSU18 — prijave sadržaja

17. **„Prijavi" za poruke u chatu** — kontekst meni poruke u cohor serveru + hover flag ikonica u DM
    porukama otvaraju `ReportPopup` (`targetType="message"`); admin/moderator ih već vide u panelu.

### SSU19 — premium

18. **Otkazivanje važi do kraja perioda** — `cancel()` sada samo postavlja `cancelAtPeriodEnd`
    (nova kolona + migracija 0025); pristup ostaje do `endsAt`, novi cron gasi istekle pretplate.
19. **Personalizacije se ČUVAJU** — banner/GIF avatar se više ne brišu pri otkazivanju; umesto toga se
    prikaz gejtuje na read-time za ne-premium korisnike (podatak ostaje za reaktivaciju).
20. **Reaktivacija** pre isteka samo skida flag (ništa se ne naplaćuje duplo).
21. **Cena usklađena** — Settings više ne hardkoduje €39.99/€4.99; čita iz `lib/pricing.ts` ($49.99/god).

### SSU1/2 — registracija organizacije

22. **Org se više NE auto-loguje pre odobrenja** — registracija organizacije ne vraća tokene
    (`pendingApproval: true` + ekran „Zahtev je poslat"); login pending org-a → `403` sa jasnom porukom.
    Odbijene organizacije se i dalje mogu ulogovati (da vide razlog i pošalju ponovni zahtev — SSU2).
    Testirano: nova org registracija → bez sesije; `garaza@` (pending) → blokiran login; `org@`
    (approved) → normalan login.

### SSU20 — potvrđeno da je popravljeno ranijim commitovima (re-test danas)

- **Merch checkout** radi: porudžbina sa punim shipping podacima prošla, poeni skinuti (1500), balans tačan.
- **Daily Spin** dodeljuje realne poene: `POST /games/:id/plays score=80` → +80 XP na balans.
- **Leaderboard** čita realan API (poeni/bedževi/hakatoni) — pobednici našeg test hakatona su na vrhu.

### SSU21 — ban / GDPR / admin

23. **Vremenski ograničen ban + auto-otključavanje** — `user_bans.expires_at` (migracija 0026,
    null = trajno), admin bira trajanje u suspend modalu (7 dana / 30 dana / trajno),
    `getActiveBan` ignoriše istekle banove, cron ih automatski lift-uje. Login banovanog vraća
    razlog + `bannedAt` + `expiresAt`. Testirano: ban od 4s → login blokiran tokom, prolazi posle
    isteka; trajni ban → `expiresAt: null`; expiry u prošlosti → `400`.
24. **GDPR brisanje naloga** — `POST /users/me/delete` (potvrda lozinkom): soft-delete +
    anonimizacija (email/username/bio/avatari/OAuth id-jevi/random hash) + poništavanje svih
    sesija (`tokenVersion+1`). Dugme „Obriši nalog" u podešavanjima povezano (modal sa lozinkom →
    logout → /login). Testirano: pogrešna lozinka `401`, posle brisanja login `401`, red anonimizovan.
25. **Admin profil modal na realnim podacima** — čita `getPublicProfile` (poeni, bedževi, bio,
    datum registracije); `_mockProfiles.ts` obrisan.
26. **`/suspended` bez hardkodovanih podataka** — login banovanog snima realan razlog/datume u
    sessionStorage i vodi na /suspended (countdown do otključavanja, „Trajna suspenzija" za
    permanentne); žalba povezana na realan `POST /auth/appeal`.

## 3. Fake hakatoni za dalje ručno testiranje (traju do 20. jula)

Sva tri je kreirala verifikovana organizacija `org@tikimiki.dev` (lozinka `password123`):

1. **Tiki Live Sprint 2026** — `ONGOING`, traje do **20.7. u 20:00**. Tvoj nalog
   (`dimitrije.pesicc@gmail.com`) je **odobren učesnik** sa timom **„Digitalci Live"** (ti + nenad),
   kanban tabla („Za uraditi/U toku/Završeno") spremna, glasanje publike **otvoreno do 20.7. u 19:00**.
   Uloguj se i odmah si „na hakatonu": desni rail → kartica aktivnog hakatona → cohor server.
   Fenjer ima pending prijavu da organizator ima šta da odobrava.
2. **Tiki Summer Hack 2026** — `UPCOMING` (hibridni, Startit Beograd), rok prijave **17.7. 23:59**,
   traje **18–20.7.**, max 6 učesnika, forma sa 2 pitanja (tekst + izbor). Tim „Letnji Tim"
   (fenjer+mara) već odobren kroz novi team-approve. Idealan za testiranje prijava iz UI.
3. **Flow Test Hakaton 2026** — `FINISHED` sa **objavljenim rezultatima**: 1. Digitalci QA, 2. Solo Rakete, bounty „Najbolji AI feature" (Nordeus, 500 EUR). Na javnoj stranici hakatona se
   vidi podijum; pobednici imaju poene i bedž „Pobednik" na profilu i leaderboardu.

## 4. Kako je testirano (metodologija)

- **API E2E**: svaki korak flowa izveden `curl`-om nad živim backendom, sa proverom odgovora i stanja
  u bazi (psql upiti nad `applications`, `point_transactions`, `user_badges`, `notifications`,
  `hackathon_results`).
- **Limit testovi**: za svaki resurs testiran „srećan put" + prekoračenje (kapaciteti, rokovi, dupli
  unosi, tuđi resursi, pogrešna rola, gost bez identiteta).
- **Scheduler-i testirani realno**: statusne tranzicije čekane da ih odradi cron (≤60s), ne SQL.
- **Regresija**: `pnpm --filter ./backend typecheck` ✅, `frontend tsc --noEmit` ✅ (bez novih grešaka;
  jedine preostale su stare u `e2e/selenium` — nedostajući dev dependency, ne tiču se aplikacije),
  **backend unit testovi 139/139** ✅ (ažuriran scheduler spec za novu metodu), prettier format ✅.
- **UI smoke**: svih 21 glavnih ruta vraća 200 (/, /login, /signup/organization, /hackathons,
  detalji sva 3 hakatona, /apply, /leaderboard, /applications, /cohor, /store, /gamehub,
  /notifications, /settings, /u/:user, /admin, /suspended, /messages, /teams, /hackathons/manage,
  /hackathons/new).

## 5. Šta je i dalje poznato ograničenje (svesno, ne bug)

- Spin točak: dobitni segment se bira klijentski (deterministički po danu), a server kapira nagradu
  na `maxPointsPerPlay=100` — prikaz „+200 XP" na točku je kozmetika; kredituje se ≤100.
- Timovi se formiraju samo dok je hakaton `upcoming` (poslovno pravilo — timovi se zaključavaju
  startom događaja).
- „Istorija plasmana" kao posebna sekcija na profilu ne postoji — pobede se vide kroz poene, bedž
  „Pobednik" i leaderboard (podaci su realni).
- PCI-DSS naplata je i dalje mock gateway (kao i do sada — kandidat za usklađivanje SSU dokumenta).
