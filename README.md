# tikimiki

All-in-one platform for the hackathon ecosystem — discovery, verified teams,
in-event collaboration (chat + Kanban), results, and gamified engagement.

Projekat "tikimiki" je razvijen u okviru predmeta Principi softverskog
inženjerstva (SI3PSI) na Elektrotehničkom fakultetu u Beogradu. Platforma
objedinjuje ceo životni ciklus hakathona na jednom mestu.

## Ključne funkcionalnosti
* **Pametni timovi:** Automatski profili na osnovu GitHub-a i AI predlaganje timova.
* **Komunikacija:** Ugrađeni chat serveri za svaki događaj.
* **Uloge:** Sistem nudi pristup gostima, članovima, organizacijama i administratorima.
* **Nagrađivanje:** Dodeljivanje bedževa i poena takmičarima.
* **Premium:** Dodatne opcije za personalizaciju profila.

## Tim "digitalci"
* Stevan Gnjato (vođa tima)
* Andrej Čolić
* Dimitrije Pešić
* Nenad Skoković

---

## Monorepo (pnpm workspaces)

| Path | What |
|---|---|
| `frontend/` | Next.js 14 (App Router, TypeScript) — the UI |
| `backend/` | NestJS + Drizzle ORM — REST API + (later) WebSockets |
| `docs/` | PRD, technical blueprint, database specification (v4.3, 59 tables) |
| `deliverables/` | Course deliverables (formal reviews, HTML prototype) |

Stack: **Next.js · NestJS · Drizzle · PostgreSQL 16 + PostGIS · Redis 7**, all TypeScript.

## Local quickstart

**Prerequisites:** Node 22, Docker Desktop (running), and pnpm
(`corepack enable` in an admin shell, or `npm i -g pnpm`).

```bash
# 1. install all workspaces
pnpm install

# 2. env (defaults already match docker-compose — no edits needed for local)
cp .env.example .env            # PowerShell: Copy-Item .env.example .env

# 3. start Postgres (+PostGIS) and Redis
pnpm db:up

# 4. create the schema + demo data
pnpm --filter ./backend db:migrate
pnpm --filter ./backend db:seed

# 5. run frontend (:3000) + backend (:4000)
pnpm dev
```

Open **http://localhost:3000**, then sign in (seeded accounts, password
`password123`):

| Account | Role |
|---|---|
| `admin@tikimiki.dev` | Administrator |
| `andrej@tikimiki.dev` | Member (1240 pts) |
| `org@tikimiki.dev` | Organization (ETF HackWeek) |

Health check: http://localhost:4000/api/v1/health · Inspect data:
`pnpm --filter ./backend db:studio`.

### No Docker?
Use a free managed Postgres (Neon, with PostGIS) + Redis (Upstash), put their
URLs in `.env` as `DATABASE_URL` / `REDIS_URL`, then run steps 4–5. Skip `db:up`.

## Useful scripts (root)

| Command | Does |
|---|---|
| `pnpm dev` | frontend + backend in watch mode |
| `pnpm db:up` / `pnpm db:down` | start / stop Postgres + Redis |
| `pnpm --filter ./backend db:generate` | regenerate a migration after schema edits |
| `pnpm --filter ./backend db:seed` | load demo data (idempotent) |
| `pnpm build` · `pnpm lint` | build / lint all workspaces |

## Verzije projekta (Changelog)

| Verzija | Datum | Opis promena | Autori |
| :--- | :--- | :--- | :--- |
| **1.0** | 04.04.2026. | Inicijalna verzija projektne specifikacije. | Andrej Čolić, Stevan Gnjato |
| **2.0** | 06.04.2026. | Verzija nakon konsultacije sa demonstratorom. (dodate dodatne funkcionalnosti) | Andrej Čolić, Stevan Gnjato, Dimitrije Pešić, Nenad Skoković |
| **2.1** | 12.04.2026. | Početna HTML stranica i skoro svi SSU dokumenti | Andrej Čolić, Dimitrije Pešić, Nenad Skoković |
