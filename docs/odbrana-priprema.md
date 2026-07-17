<!-- Priprema za odbranu — pregled implementacije i koda (generisano 16.07.2026) -->

# tikimiki — priprema za odbranu

Cilj dokumenta: da za svaku celinu znaš (1) ŠTA radi, (2) GDE je kod, (3) KAKO radi ispod haube,
i (4) šta bi te verovatno pitali. Sve putanje su relativne od korena repoa.

---

## 1. Elevator pitch (30 sekundi)

**tikimiki je all-in-one platforma za hakatone**: organizacije objavljuju hakatone, članovi se
prijavljuju (pojedinačno ili kao tim), formiraju timove, dobijaju Discord-like server ("cohor") sa
kanalima i real-time chatom, predaju projekte, publika glasa, organizator proglašava pobednike, a
pobede se beleže kroz poene, bedževe i leaderboard. Uz to: društveni feed, direktne poruke,
gamifikacija (store, kozmetika, mini-igre), premium pretplata, GitHub integracija za verifikaciju
veština, admin/moderacija, i18n (SR/EN) i više tema.

## 2. Stack — šta i zašto

| Sloj      | Tehnologija                                                  | Zašto                                                                        |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Frontend  | **Next.js 14 (App Router) + React 18 + TS**                  | file-based routing, server komponente za `<title>`/metadata, dev proxy       |
| Backend   | **NestJS 10 + TS**                                           | modularna arhitektura (DI, guards, pipes), WebSocket gateway, cron scheduler |
| Baza      | **PostgreSQL** (docker)                                      | relacioni domen (prijave, timovi, poeni…), enumi, transakcije                |
| ORM       | **Drizzle ORM**                                              | type-safe šema u TS-u, SQL-blizak (nema magije), generisane migracije        |
| Real-time | **Socket.io** (`@nestjs/websockets`)                         | sobe (rooms) po korisniku/kanalu/konverzaciji, JWT auth na handshake-u       |
| Auth      | **JWT (access+refresh) + argon2 + OAuth**                    | stateless access token; refresh u httpOnly cookie sa rotacijom               |
| Monorepo  | **pnpm workspace** (`frontend`, `backend`, `packages/types`) | deljeni tipovi FE↔BE — jedan izvor istine                                    |

Napomena za iskrenost: `docker-compose.yml` podiže i **Redis**, ali ga backend kod trenutno **ne
koristi** (postoji samo `REDIS_URL` u `backend/src/config/env.ts` kao rezervisana infrastruktura).
Ako pitaju — reci tačno to, ne izmišljaj upotrebu.

## 3. Struktura monorepa

```
tikimiki/
├─ frontend/          Next.js app (src/app = rute, src/components, src/lib/api.ts)
├─ backend/           NestJS API (src/<modul>/…), drizzle/ = 31 SQL migracija, uploads/ = fajlovi
├─ packages/types/    @tikimiki/types — deljeni tipovi i notification template registry
├─ docker-compose.yml postgres + redis
├─ docs/              specifikacije (use-case, baza, UML), testiranje
└─ tests/, backend/tests/  Selenium (IDE + webdriver) UI testovi
```

Ključne komande: `pnpm start:all` (docker db + oba dev servera), `pnpm db:setup`
(up + migrate + seed), `pnpm check` (format + lint + typecheck + unit testovi).

## 4. Kako teče jedan request (nauči ovo napamet)

1. Browser zove `fetch("/api/v1/...")` — **isti origin kao frontend** (localhost:3000).
2. `frontend/next.config.mjs` ima `rewrites()` koji proksira `/api/v1/*` → backend (localhost:4000)
   i `/uploads/*` → statičke fajlove. Zato je refresh cookie **first-party** (nema CORS drame).
3. `frontend/src/lib/api.ts` je jedini API klijent: dodaje `Authorization: Bearer <accessToken>`
   (token živi samo u memoriji), a na **401 automatski** zove `/auth/refresh` pa ponovi zahtev
   jednom (`NO_RETRY` skup sprečava petlju na samim auth endpointima).
4. NestJS: `main.ts` postavlja globalni prefiks `api/v1`, CORS na `WEB_ORIGIN`, cookie parser i
   statičko serviranje `uploads/`. Ruta ide kroz `JwtAuthGuard` (ili `OptionalJwtAuthGuard` za
   javne rute poput `/search`), kontroler validira DTO (zod šeme u `dto.ts`), servis radi posao
   kroz Drizzle, vraća DTO oblikovan za klijenta.
5. Ako akcija ima real-time posledicu (poruka, notifikacija), servis nakon upisa u bazu zove
   `RealtimeGateway.emit*` koji emituje u odgovarajuću Socket.io sobu.

## 5. Autentikacija i autorizacija (najčešća pitanja na odbrani)

Kod: `backend/src/auth/*`, `backend/src/common/authz.service.ts`.

- **Lozinke**: argon2 (`@node-rs/argon2`) — memory-hard, moderna preporuka umesto bcrypt-a.
- **Access token**: JWT, kratkoživeći (15 min, `JWT_ACCESS_TTL`), payload `{ sub, typ: "access" }`,
  drži se SAMO u JS memoriji frontenda (ne u localStorage — XSS ne može da ga pokupi sa diska).
- **Refresh token**: JWT (30 dana) u **httpOnly cookie** `tikimiki_refresh`, sa **suženim path-om**
  na auth podstablo (cookie se ne šalje na svaki API poziv). **Rotira se pri svakoj upotrebi.**
- **"Sign out svuda"**: `users.tokenVersion` — refresh token nosi `ver` sa kojim je izdat; promena
  lozinke bumpuje verziju pa svi stari refresh tokeni prestaju da važe (`auth.service.ts:89`).
  Access tokeni ostaju stateless i prosto isteknu za ≤15 min.
- **OAuth**: GitHub/Google (`oauth.service.ts`) — backend flow, na povratku mint-uje istu sesiju
  (`issueSession`). Frontend leg: `/login?oauth=success|error|unconfigured`.
- **Email verifikacija / reset lozinke**: stateless potpisani linkovi sa TTL-om
  (`account.service.ts`); u dev-u se link loguje/vraća kao `devLink` jer nema SMTP-a.
- **Tri uloge**: `administrators`, `members`, `organizations` — odvojene tabele vezane na `users`
  (ne enum kolona!). `me` endpoint vraća `roles: { isAdmin, isMember, isOrganization }`.
- **Org nalozi (SSU1)**: registracija org naloga NE izdaje sesiju — zahtev čeka admin odobrenje
  (`pendingApproval`), pa tek posle odobrenja login radi.
- **Autorizacija u cohor serverima**: `common/authz.service.ts` — role/permission model po serveru
  (server_roles, permissions, server_role_permissions), proverava se i na REST i na WS join.

## 6. Baza i Drizzle

Kod: `backend/src/db/schema/*` (grupisano po domenu: `identity`, `hackathons`, `cohor`, `feed`,
`gamification`, `commerce`, `kanban`, `skills`, `application_form`, `team_requests`, `platform`),
`backend/drizzle/` = 31 generisana SQL migracija + `meta/` snapshotovi.

- Šema je **napisana u TypeScript-u** (`pgTable(...)`), Drizzle iz nje generiše SQL migracije
  (`pnpm db:generate` → `db:migrate`). Enumi su centralizovani u `_enums.ts`.
- **Soft delete** konvencija: `deletedAt` kolona; svi upiti filtriraju `isNull(deletedAt)`.
- Injektuje se kroz DI token `DRIZZLE` (`db.module.ts`, `@Global()` modul, pool `max: 10`).
- Transakcije: `db.transaction(async (tx) => …)` — npr. registracija (user + member row),
  timska prijava (sve prijave odjednom), dodela poena.

## 7. Životni ciklus hakatona (glavni domen — nauči ceo tok)

Kod: `backend/src/hackathons/*`, `applications/*`, `teams/*`, `projects/*`, `voting/*`, `bounties/*`.

1. **Kreiranje**: org `POST /hackathons` → u istoj transakciji se automatski kreira **cohor server**
   sa kanalima (announcements, general…) i rolama.
2. **Prijave** — vidi §8 (tvoj modul).
3. **Timovi**: `POST /teams`, pozivnice + join requestovi (`team_requests`), limit `maxTeamSize`.
   Ulazak u tim automatski fajluje prijavu na hakaton ako ne postoji.
4. **Status mašina**: `upcoming → ongoing → finished` — tranzicije radi **cron scheduler**
   (`hackathons/hackathons-status.scheduler.ts`, `@Cron` svakog minuta): auto-start kad prođe
   `startsAt`, auto-finish kad prođe `endsAt` (+ backstop za preskočene). `GET /me/active-hackathon`
   pokreće karticu "aktivni hakaton" u desnom railu.
5. **Projekti**: tim kreira projekat, `POST /projects/:id/submit` — posle roka `400`.
6. **Glasanje publike**: org otvara prozor (`voting/*`); glasati može član i **gost** (fingerprint),
   jedan glas po hakatonu.
7. **Rezultati**: `POST /hackathons/:id/results` (samo organizator) — upis podijuma je
   **idempotentan**: poeni (5000/3000/…) se dodeljuju kroz `common/points.service.ts` **ledger**
   (`point_transactions` sa `type` + `referenceId`), pa ponovni publish ne duplira transakcije.
   Uz to: bedž "Pobednik", notifikacija `hackathon_result_posted` svim učesnicima, leaderboard.
8. **Sponzorski bounty**: `bounties/*` — nezavisne nagrade sponzora, 1000 poena po članu +
   `bounty_placement` transakcija (profil ih prikazuje kao "sponsor wins").

## 8. Applications — TVOJ modul (očekuj najdetaljnija pitanja)

Kod: `backend/src/applications/applications.{controller,service}.ts` + `dto.ts` (Autor: Andrej Colić).

Endpointi (kontroler): `POST /applications` (pojedinačna), `POST /applications/team` (timska),
`GET /applications/me`, `GET /applications/hackathon/:id` (+ `/stats`), CRUD pitanja na formi
(`/hackathon/:id/questions`, `PATCH/DELETE /questions/:id`), `GET /:id/answers`,
`PATCH /:id/withdraw | /:id/approve | /:id/approve-team | /:id/reject`.

Šta da znaš da objasniš:

- **Custom forma po hakatonu**: organizator definiše pitanja (`application_questions`), prijava
  nosi odgovore; `assertAnswersCompleteForm` odbija prijavu ako fali odgovor na obavezno pitanje
  (`400 All required questions must be answered`).
- **Dupla prijava**: `409 You already have an active application` — proverava se da li postoji
  aktivna (ne-withdrawn, ne-deleted) prijava. Withdraw pa nova prijava je dozvoljeno.
- **Rok**: posle `registrationDeadline` → `400 Registration is closed`.
- **Kapacitet (SSU11)**: `approve` broji već odobrene i baca `400 Hackathon is full` preko
  `maxParticipants` — proverava se u momentu ODOBRAVANJA, ne prijave (prijava sme na waitlist).
- **Timska prijava**: `createTeam` u jednoj transakciji kreira prijave za sve članove tima;
  `approveTeam` odobrava sve otvorene prijave tima uz ZBIRNU proveru kapaciteta (sve ili ništa).
- **Side-effects odobrenja**: `grantServerMembership` — odobreni učesnik automatski dobija
  Participant rolu na cohor serveru hakatona; `notifyDecision` upisuje notifikaciju
  (`application_approved` / `application_rejected` sa razlogom) + email.
- **Dve perspektive DTO-a**: aplikant vidi svoju prijavu (`ApplicationDto`), organizator listu
  kandidata sa profilom, veštinama i odgovorima (`listForHackathon` — tu se koristi i
  `gatedAvatarUrl`, vidi §12).

## 9. Real-time chat i cohor serveri

Kod: `backend/src/realtime/realtime.gateway.ts`, `chat/*`, šema `db/schema/cohor.ts`.

- **Handshake auth**: klijent šalje access token u `io(url, { auth: { token } })`; gateway ga
  verifikuje (odbija refresh tokene po `typ`!), socket ulazi u ličnu sobu `user:<id>`.
- **Sobe**: `channel:<id>` (server kanali), `conversation:<id>` (DM). **Svaki join se proverava
  protiv baze** (SSU8/9): socket može da uđe samo u sobe servera/konverzacija/boardova kojima
  korisnik stvarno pripada; neovlašćen join se tiho ignoriše.
- **Presence**: mapa `userId → broj konekcija` (više tabova), broadcast online liste.
- **Tok poruke**: REST `POST` → ChatService upiše u bazu → `emit*` u sobu → svi klijenti u sobi
  dobiju poruku live. (Poruka se NE šalje kroz WS — WS je samo notifikacioni kanal; ovako poruka
  nikad ne može da stigne a da nije sačuvana.)
- **Cohor** = Discord-like struktura: `servers → channel_groups → channels`, role i permisije po
  serveru, team-only kanali (ograničeni na članove tima), moderacija (reports, moderator stranica).

## 10. Gamifikacija

- **Poeni**: `common/points.service.ts` — ledger obrazac: svaka dodela je red u
  `point_transactions` (`type`, `referenceId`), `members.points` je agregat. Idempotentnost =
  "postoji li već transakcija ovog tipa za ovu referencu".
- **Bedževi**: `badges` + `user_badges` (npr. "Pobednik", "Flawless4" iz mini-igre).
- **Leaderboard**: `leaderboard/*` — periodi all/month/week (SSU17).
- **Store**: `store/*` — merch + kozmetika (`cosmetic_items`, kupovina poenima), equipovanje
  (`user_equipped_cosmetics`: username_effect / avatar_decoration), rendering hint u `renderData`.
- **Mini-igre**: `games/*` (npr. "Grupe" — NYT Connections klon) sa achievement bedžom.

## 11. Premium pretplata

Kod: `backend/src/subscriptions/*`.

- Jedan plan ("premium"), nema pravog payment gateway-a — kupovina je simulirana.
- `isPremium(userId)` = postoji `subscriptions` red sa `status='active'` i `endsAt > now()`.
  **To je jedini izvor istine** za premium gating.
- Otkazivanje = flag `cancelAtPeriodEnd` (pristup ostaje do isteka); cron
  (`subscriptions-expiry.scheduler.ts`) prebacuje istekle redove u `cancelled`/`expired`
  (bookkeeping — pristup je već ugašen jer `isPremium` traži `endsAt` u budućnosti).
- **Premium personalizacija (SSU19)**: baner + animirani GIF avatar. Otkaz NE briše podatke —
  gating je na ČITANJU (`premium-personalization.ts`): `gatePremiumPersonalization` (JS varijanta
  za pojedinačne profile) i `gatedAvatarUrl` (SQL CASE za liste). Reaktivacija ih vraća.

## 12. Priča za odbranu: bug koji smo našli u premium gatingu (odlična tema!)

`gatedAvatarUrl` gradi SQL `CASE WHEN avatar ~* '\.gif$' AND NOT EXISTS (SELECT 1 FROM
subscriptions s WHERE s.user_id = <owner>...)`. Bug: Drizzle u **single-table** selectu renderuje
interpolisanu kolonu **bez imena tabele** (`"user_id"` umesto `"users"."user_id"`), pa se unutar
podupita ime vezivalo za `subscriptions s` — uslov je postao tautologija `s.user_id = s.user_id`
i gate je propuštao GIF čim IKO na platformi ima aktivan premium. U JOIN upitima (feed, chat)
Drizzle kvalifikuje kolone pa je tamo radilo — zato je curelo baš na searchu (single-table upit)
i na teams stranici (tamo avatar uopšte nije bio gate-ovan). Fix
(`premium-personalization.ts:33`): ručna kvalifikacija kolone kroz `getTableName` +
`sql.identifier`, plus popravljen regex (`'\.gif$'` se zbog JS escape-a slao kao `'.gif$'`).
Pouka koju možeš da izgovoriš: _ORM sugar oko raw SQL-a menja semantiku korelisanih podupita;
verifikovali smo generisani SQL i uživo ponašanje endpointa pre i posle._

## 13. Notifikacije i deljeni tipovi

- `packages/types/src/notifications.ts` = **registry šablona**: svaki tip notifikacije ima
  `key` + šablone teksta (SR/EN). Backend upisuje `{ key, params }`, frontend renderuje na jeziku
  korisnika. `NotificationTemplateKey` je union tip — ako backend upotrebi nepostojeći ključ,
  **TypeScript pukne na build-u** (to se desilo sa `project_video_uploaded` — ključ je postojao u
  source-u ali `packages/types/dist` nije bio rebuild-ovan; rešenje: `pnpm --filter
@tikimiki/types build`).
- Dostava: red u `notifications` tabeli + WS emit u `user:<id>` sobu + (za bitne) email kroz
  `mail/mail.service.ts` (nodemailer; bez SMTP-a u dev-u loguje u konzolu).

## 14. Frontend arhitektura

- **App Router**: `src/app/<ruta>/page.tsx` je server komponenta (metadata/title), interaktivni
  deo je `"use client"` klijent komponenta (`XyzClient.tsx`). CSS po stranici (`admin.css`,
  `auth.css`…) + `globals.css` sa **CSS custom properties** za teme.
- **Teme**: default (dark, lemon/violet), `mono`, `light`, `light-mono` — `html[data-theme]`
  redefiniše tokene (`--lemon`, `--ink`, `--on-accent`…). Pouka iz prakse: page-level stylesheeti
  dele klase (`hk-tab`), pa je specifičnost bitna — imali smo sudar admin/hackathons CSS-a
  (žuto-na-žuto aktivni tab) rešen scope-ovanjem selektora (`.adm-tabs .hk-tab.hk-tab-active`).
- **i18n**: `useT(M)` hook — svaka komponenta nosi svoj `M` rečnik `{ en, sr }`; `LanguageProvider`
  drži izbor jezika.
- **Auth na FE**: `AuthProvider` + `lib/api.ts` (access token u memoriji, auto-refresh na 401).
- **Login/Signup**: jedna deljena kartica `app/login/AuthClient.tsx` za obe rute (mode switch
  menja URL kroz `history.replaceState` bez remount-a). Validacija "reward early, punish late":
  greške se računaju live ali prikazuju tek posle blur-a; checklist zahteva za lozinku; live
  provera zauzetosti email/username (debounce 500ms + sequence guard protiv stale odgovora).
  Napomena: `app/signup/SignupClient.tsx` je mrtav kod (ruta koristi AuthClient) — znaj to ako
  neko otvori fajl.
- **Real-time na FE**: socket.io klijent, sluša sobe; notifikacioni bell i chat se pune live.

## 15. Testiranje i kvalitet

- **Unit**: Vitest u backendu (`backend/test/unit`, `pnpm test:unit`).
- **Integracioni**: `backend/test/integration` — gađaju pravu (test) bazu; vitest preseta
  `DATABASE_URL` na `tikimiki_test` PRE učitavanja env-a (zato env loader ne pregazi postojeće
  vrednosti).
- **UI**: Selenium (IDE snimci + webdriver skripte u `backend/tests/` i `tests/`).
- **Ručno end-to-end**: `sve_funkcionalnosti_flow.md` — ceo prirodan tok testiran uživo,
  uključujući limit testove (dupla prijava, kapacitet, rok…) i bugove nađene pa fixovane
  (scheduler auto-start, maxParticipants na approve, approve-team).
- **Higijena**: husky pre-commit (prettier kroz lint-staged), `pnpm check` = format + lint +
  typecheck + unit.

## 16. Demo za odbranu

- Pokretanje: `pnpm start:all` (docker postgres+redis, backend :4000, frontend :3000).
- Seed nalozi (lozinka `password123`): `admin@tikimiki.dev`, `org@tikimiki.dev`,
  `andrej@ / nenad@ / mara@ / fenjer@tikimiki.dev`.
- Najefektniji demo tok: org kreira hakaton → prijava člana (custom pitanje) → approve (stigne
  notifikacija + učesnik automatski u cohor serveru) → tim + chat poruka uživo u dva browsera →
  predaja projekta → rezultati → poeni/bedž na profilu + leaderboard.

## 17. Verovatna pitanja + kratki odgovori

1. **Zašto NestJS a ne Express?** Struktura za tim od 4 (moduli, DI, guards), ugrađen WS gateway i
   cron scheduler, testabilnost (servisi bez HTTP sloja).
2. **Zašto Drizzle a ne TypeORM/Prisma?** Šema u TS = tipovi bez codegen ceremonije, generisane SQL
   migracije koje možeš pročitati, blizak SQL-u (a §12 pokazuje da razumemo i njegove ivice).
3. **Gde stoji refresh token i zašto?** httpOnly cookie sa suženim path-om + rotacija; access u
   memoriji. XSS ne može da ukrade refresh, CSRF je ublažen prefiksom path-a i CORS-om.
4. **Kako radi "odjavi me svuda"?** tokenVersion u users tabeli; refresh nosi `ver`, bump verzije
   invalidira sve ostale uređaje.
5. **Šta se dešava kad hakaton počne?** Cron scheduler menja status, učesnici već imaju server
   membership (dodeljen na approve), FE kartica vodi u cohor server.
6. **Kako sprečavate dupliranje poena?** Ledger: transakcija po (type, referenceId) — publish
   rezultata je idempotentan.
7. **Kako WS zna ko sme u koju sobu?** Membership check u bazi na svaki join; token se verifikuje
   na handshake-u i odbijaju se refresh tokeni.
8. **Kako biste skalirali?** Stateless API (JWT) → horizontalno; Socket.io Redis adapter (Redis je
   već u compose-u); Postgres indeksi + read replike; uploads na S3/CDN umesto lokalnog diska.
9. **Šta biste popravili?** Pravi captcha (sad je vizuelni placeholder), pravi payment za premium,
   rate limiting, e2e CI pipeline, brisanje mrtvog koda (SignupClient).
10. **Bezbednosne mere?** argon2, kratki access TTL, rotacija refresh tokena, LIKE-escape u
    pretragama (`searchUsers`), zod validacija DTO-ova, soft-delete filtriranje, permisioni model
    u cohoru, account-enumeration neutralne poruke kod forgot-password.

## 18. API-ji — koji, gde i kako

### A. Sopstveni API-ji (koje smo mi implementirali)

1. **REST API** — `/api/v1/*`, NestJS, **29 kontrolera / ~215 endpointa**.
   - Obrazac po modulu: `<modul>.controller.ts` (rute + guards + zod DTO validacija iz `dto.ts`)
     → `<modul>.service.ts` (logika + Drizzle) → DTO odgovor. Globalni prefiks u `main.ts`.
   - Zaštita: `JwtAuthGuard` (obavezna prijava), `OptionalJwtAuthGuard` (javne rute, npr.
     `GET /search`), `@CurrentUser()` dekorator vadi userId iz verifikovanog tokena.
   - Frontend ga zove ISKLJUČIVO kroz `frontend/src/lib/api.ts` — jedan wrapper oko `fetch`:
     dodaje `Authorization: Bearer`, na 401 automatski `POST /auth/refresh` pa retry jednom.
     Zahtevi idu na isti origin, a `next.config.mjs` rewrites ih proksira na backend.
2. **WebSocket API** — Socket.io (`backend/src/realtime/realtime.gateway.ts`).
   - Klijent → server eventi: `joinChannel`, `leaveChannel`, `joinServer`, `leaveServer`,
     `joinConversation`, `leaveConversation`, `joinKanban`, `leaveKanban`, `typing`, `getPresence`.
   - Server → klijent eventi: `channelMessage`, `directMessage`, `notification`,
     `messageReaction`, `presence`, `userTyping`.
   - Auth na handshake-u (JWT access token), svaki join membership-checked u bazi; servisi posle
     upisa u bazu zovu `emit*` helpere — WS je čisto notifikacioni kanal, ne persistira ništa.

### B. Spoljni (third-party) API-ji

1. **GitHub OAuth 2.0** (`backend/src/auth/oauth.service.ts`) — login preko GitHub-a:
   `github.com/login/oauth/authorize` → callback sa `code` →
   `POST github.com/login/oauth/access_token` → `GET api.github.com/user` (+ `/user/emails` ako je
   email privatan). Scope `read:user user:email`. Access token se ČUVA u `users.githubAccessToken`
   za kasniju verifikaciju veština.
2. **Google OAuth 2.0 / OIDC** — `accounts.google.com/o/oauth2/v2/auth` →
   `POST oauth2.googleapis.com/token` → `GET www.googleapis.com/oauth2/v2/userinfo`.
   Scope `openid email profile`.
3. **LinkedIn OIDC** ("Sign In with LinkedIn v2") — `linkedin.com/oauth/v2/authorization` →
   `POST /oauth/v2/accessToken` → `GET api.linkedin.com/v2/userinfo`. Dugme postoji na login
   kartici; bez ključeva u env-u backend vraća `oauth=unconfigured` i FE prikaže poruku.
   Sva tri: `isConfigured()` gleda env varove pa se provider gracefully gasi ako nema ključeva;
   `completeLogin` find-or-create lokalnog usera po provider ID-u; `completeLink` (Settings →
   "Poveži") kači identitet na POSTOJEĆI nalog uz proveru konflikta.
4. **GitHub REST API v3** (`backend/src/github/github.service.ts`) — verifikacija veština (N01):
   `GET /user/repos?per_page=100&sort=pushed` + `GET /repos/:owner/:repo/languages` za top 5
   najaktivnijih repoa (bajt-nivo raspodela jezika; ostali repoi se broje po `repo.language`).
   Rezultat: top jezici → `deriveAndStoreSkills` upsertuje `member_skills` sa
   `source: "github", verified: true`. Greške mapirane: 401 → `UnauthorizedException` (istekao
   token), ostalo → `BadGatewayException`. Header `User-Agent: tikimiki` (GitHub ga zahteva).
5. **SMTP preko nodemailer-a** (`backend/src/mail/mail.service.ts`) — nije HTTP API nego protokol;
   bez `SMTP_HOST` u dev-u mejlovi se loguju u konzolu (isti dev-friendly obrazac kao devLink).
6. **Google Maps embed** (`frontend/.../HackathonDetailClient.tsx`) — mapa lokacije hakatona kao
   iframe `google.com/maps?q=<lat>,<lng>&output=embed` + link ka Maps pretrazi. Bez API ključa —
   zato embed varijanta, ne Maps JavaScript API.
7. **Google Calendar link** (`frontend/src/components/popups/CalendarPopup.tsx`) — "dodaj u
   kalendar" gradi `calendar.google.com/calendar/render?...` URL (URL šema, ne REST poziv).
8. **Google Fonts** (`frontend/src/app/layout.tsx`) — Bricolage Grotesque + Space Grotesk.

Ako pitaju "da li koristite neki plaćeni/AI API" — ne: "AI predlozi timova" (`matching/*`) su
naš deterministički scoring algoritam nad veštinama u bazi, ne LLM poziv; captcha je vizuelni
placeholder (nema pravog Turnstile/reCAPTCHA poziva); plaćanje premiuma je simulirano.

## 19. Ko je šta radio (po `Autor:` komentarima u kodu)

- **Andrej Colić (2023/0492)** — applications modul (prijave, custom forma, approve/reject/team).
- **Dimitrije Pesic (2023/0014)** — matching (predlozi timova), premium personalizacija, flow test.
- **Nenad Skoković (2023/0039)** — GitHub integracija, mail, više servisa.
- **Stevan Gnjato (2023/0141)** — search, i drugo po fajlovima.

(Ovo su samo eksplicitno potpisani fajlovi — ostatak je zajednički; proveri `git log --author` ako
treba preciznije.)
