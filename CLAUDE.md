# CLAUDE.md

Uputstvo za Claude Code pri radu na **tikimiki** platformi. Čitaj ovo pre svake izmene.

---

## Šta je tikimiki

Gejmifikovana platforma za studentske hakatone: otkrivanje događaja, formiranje i upravljanje
timovima, in-event kolaboracija (chat + Kanban), rezultati, poeni/leaderboard/store, admin/moderacija.
Korisnici: studenti (ETF Beograd) i student-developeri, često na mobilnom tokom samog događaja.

## Stack (izvor istine — ne menjaj bez razloga)

- **Monorepo:** pnpm workspaces.
  - `frontend/` — Next.js 14 (App Router, TypeScript), dev `:3000`
  - `backend/` — NestJS + **Drizzle ORM** + **PostgreSQL 16 + PostGIS** + **Socket.io** (već implementiran), dev `:4000`, API prefix `/api/v1`, proxied same-origin u dev-u
  - `packages/types/` — deljeni domenski tipovi/enumi (jedini izvor istine za tipove)
  - `docs/` — PRD, blueprint, DB spec
- **Redis 7** za keš/realtime potporu.
- Sve je TypeScript. ORM je **Drizzle** — NE Prisma. Baza koristi **PostGIS** (koordinate preko `ST_X`/`ST_Y`, round-trip).

## Komande

```bash
pnpm install                                  # instaliraj sve workspace-ove
pnpm db:up / pnpm db:down                     # start/stop Postgres + Redis
pnpm --filter ./backend db:migrate            # primeni schema
pnpm --filter ./backend db:generate           # regeneriši migraciju posle schema izmene
pnpm --filter ./backend db:seed               # demo podaci (idempotentno)
pnpm --filter ./backend start:dev             # backend (:4000)
pnpm --filter ./frontend dev                  # frontend (:3000)
pnpm dev                                       # oba u watch modu
pnpm --filter ./packages/types build          # rebuild deljenih tipova
pnpm build · pnpm lint                         # build / lint svih workspace-ova
```

## Testovi

- **Pokreni:** `pnpm db:up` pa `pnpm --filter ./backend test` (unit + integration, treba Postgres).
  DB-free podskup: `test:unit`. Watch: `test:watch`. Detalji u `backend/test/README.md`.
- **Stack:** Vitest + supertest. Integration specovi dižu pravi `AppModule` preko HTTP-a na živi
  Postgres/PostGIS. `global-setup.ts` drop+recreate+migrate dedicated **`tikimiki_test`** bazu svaki
  run — **nikad dev bazu**.
- **Gotcha:** NestJS DI traži emitovane decorator metapodatke; Vitest esbuild ih baca → koristi se
  `unplugin-swc` (`legacyDecorator + decoratorMetadata`). Bez toga constructor injection puca.

---

## ⛔ Apsolutna pravila (najvažnije)

### 1. NIKAD hardcoded / fake podaci
Ovo je glavni razlog postojanja fajla. Tokom rada su se nakupljali fejk podaci i čistili su se ručno.

- **Bez hardcoded identiteta.** Nikad ne postavljaj poruke/akcije kao izmišljeni "Andrej Čolić" ni
  bilo koje drugo ime. Sve poruke idu kroz pravi API.
- **Bez fake stream-ova / promo sadržaja.** Nema lažnih message stream-ova, izmišljenih najava,
  hardcoded brojeva (npr. unread badge brojevi), `serverExtra` fallback-ova.
- **Bez fabrikovanog UI-ja** za funkcije koje ne postoje (export dugmad, skill-count, statistike koje
  backend ne vraća).
- UI se **uvek** renderuje dinamički iz backend odgovora (`getServer`, `serverGroups`, ...). Ono što
  backend ne vraća — ne prikazuj.
- Demo podaci žive **isključivo** u seed skriptama (`db:seed`, `seed-extras*.ts`) i moraju biti
  idempotentni. Ne ubacuj demo podatke u komponente.

Ako ti treba podatak kog nema u API-ju: **dodaj endpoint**, ne mokuj na frontu.

### 2. Konvencije koje se ne krše
- API prefix je uvek `/api/v1`. Frontend zove preko `lib/api.ts` klijent funkcija — ne fetch-uj ad hoc.
- Deljeni tipovi idu u `packages/types` i odatle se uvoze. Ne dupliraj domenske tipove.
- Posle schema izmene: `db:generate` → commit migracije. Nema ručnog DDL-a mimo Drizzle migracija.
- Poštuj DB check constraint-e (npr. `chk_projects_submitted_consistency`: draft ⇔ `submittedAt` null).

### 3. Pre nego što kažeš "gotovo"
- `npx tsc --noEmit` u dotičnom workspace-u prolazi.
- `pnpm lint` čist.
- Relevantni testovi prolaze; za novo ponašanje **napiši integration test** (boot `AppModule`, HTTP,
  živi Postgres) po uzoru na postojeće specove.

---

## Dizajn / brend (frontend)

- **Energična, gejmifikovana, električna.** Tri reči: competitive, playful, electric.
  Dark neon — **violet + lemon** na near-black, glow/motion nagrađuju akciju i signaliziraju stanje
  (live, earned, ranked), nikad ne smetaju čitljivosti.
- **Čitljivost je neprikosnovena** — kontrast pobeđuje atmosferu. Pazi na dark-on-dark muted tekst.
- **Radi na telefonu na događaju** — touch-friendly, responsivno, brzo na mid-range uređajima.
- **Jedan koherentan sistem:** dva akcenta, jedna type familija, deljeni token set. Efekti se troše
  namerno.
- **Wordmark:** `tikimiki` je dvobojan — `<b>tiki</b>miki` (violet + lemon). Footer: base lemon, `<b>`
  violet. Ne flipuj boje.
- **Anti-reference:** korporativni plavi SaaS dashboard, over-glassy Web3 glow gde ništa nije čitljivo,
  Bootstrap default admin tabele.
- **Pristupačnost (best-effort):** čitljiv kontrast, vidljiv keyboard focus, pravi semantički kontroli
  (button/link/label), reduced-motion put za teški glow/animaciju.
- Cohor (Discord-style chat) scope nema `--bg-2`; koristi `var(--surface-2)` i `var(--line)` umesto
  gray fallback-ova.

### ⛔ Izbegavaj tipične AI dizajn klišee
Generisani UI prepoznatljivo pada u iste navike. Naš dark-neon brend ih čini još opasnijim jer izgledaju
"u temi". Ne radi sledeće osim ako ja eksplicitno ne tražim:

- **Bez generičkog glow/aurora/gradient blob pozadina.** Nema zamućenih obojenih mrlja, "northern lights"
  efekta, radijalnih gradijenata iza hero sekcija. Pozadina je near-black i mirna; glow se troši namerno
  na *akcionim* elementima (live puls, zarađeni poeni), ne kao dekoracija celog ekrana.
- **Bez sveprisutnih sitnih obojenih bedževa/tagova.** Ne dodaji pill/chip oznake na svaku karticu i red.
  Mnoge stvari su čistiji kao tekst — npr. lokacija hakatona je **tekst, ne badge**; status ide kao jasan
  chip samo gde stvarno nosi stanje (live/upcoming/completed), ne svuda.
- **Bez emoji-kao-ikonica** u UI-ju i bez nasumičnih ✨/🚀 ukrasa. Koristi pravi icon set (rocket/list za
  channel tipove je ok jer ima funkciju).
- **Bez "everything glassmorphism"** — providne kartice naslagane na blur, gde se granice gube. Anti-ref
  je over-glassy Web3 dashboard.
- **Bez simetričnih 3-kolona "feature grid" sa identičnim ikonicama u krugovima**, generičkih hero
  copy-fraza ("Empower your X"), i centered-everything landing layouta.
- **Bez preteranog bold/gradient teksta** i naslaganih `text-shadow` glow-ova na tipografiji.
- Default: ako se element može uraditi tiho i čitljivo, uradi tako. Efekat mora da *znači* nešto
  (stanje/akcija), inače ga nema.

## Domenske beleške

- **Uloge:** gost, član, organizacija, administrator + server-level moderacija
  (`manage_server/channels/roles/messages`, `kick_members`). Organizer i platform admin implicitno
  imaju sve.
- **Channel tipovi:** `general`, `announcements` (post samo `manage_messages`), `project` (predaja —
  app surface, ne tekst), `team` (privatni team chat), `kanban` (privatni board). `project`/`kanban`
  poruke → 400 (nisu tekstualne).
- **Projekti:** jedan aktivan projekat po timu; `draft → submitted` blokiran posle `endsAt`. Endpoints
  pod `backend/src/projects`.
- **PostGIS:** koordinate hakatona se izlažu kao `latitude`/`longitude` preko `ST_X`/`ST_Y`.

## Poznato / sledeći kandidati

- `/admin` je glavna multi-tab strana još bez skeleton loadera (koristi tekst "Loading…").
- `/messages` je legacy/unlinked (cohor ga je zamenio) ali još radi.
- Seed ETF hakaton ima datume u prošlosti → prikazuje se kao završen; bump-uj seed datume za live demo.
- Predaja-projekta channel panel je još prototip mock; pravi flow je u `/teams` `ProjectPopup`. Wiring
  panela na projects API je follow-up.

---

## Stil komunikacije sa mnom

Direktno i koncizno. Kad nešto nije dobro u mom kodu/šemi, reci otvoreno — bez omekšavanja. Pre većih
arhitektonskih izmena, kratko proveri pravac.
