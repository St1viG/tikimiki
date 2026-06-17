# tikimiki — backend (NestJS + Drizzle)

TypeScript API for tikimiki. Part of the pnpm-workspaces monorepo.

## Stack
- **NestJS 10** (Node 22) — REST controllers + (later) WebSocket gateways
- **Drizzle ORM** + **postgres.js** — type-safe SQL, migrations
- **PostgreSQL 16 + PostGIS**, **Redis 7** (via root `docker-compose.yml`)
- **Zod** — env + request validation

## First-time setup
```bash
# from repo root — enable pnpm once (admin shell on Windows):
corepack enable            # or: npm i -g pnpm

pnpm install               # installs all workspaces
cp .env.example .env       # adjust secrets

pnpm db:up                 # start Postgres + Redis (needs Docker Desktop)
pnpm --filter ./backend db:generate   # generate SQL migration from schema
pnpm --filter ./backend db:migrate    # apply it
```

## Run
```bash
pnpm dev:api               # NestJS watch mode → http://localhost:4000/api/v1
# smoke test:
curl http://localhost:4000/api/v1/health   # {"status":"ok","db":true,...}
```

## Layout
```
src/
  main.ts              bootstrap (global prefix /api/v1, CORS)
  app.module.ts
  config/env.ts        Zod-validated environment
  db/
    db.module.ts       global DRIZZLE provider (postgres.js pool)
    schema/            Drizzle schema (source of truth for migrations)
      _enums.ts
      identity.ts      users, administrators, members, organizations,
                       user_bans, follows, friendships   ✅ ported
      index.ts         barrel + port-status checklist
  health/              GET /api/v1/health (DB ping)
drizzle.config.ts      drizzle-kit config (schema → ./drizzle migrations)
```

## Schema port status
The full schema is **v4.3 / 59 tables** (see `docs/database_specification/`) and
is **fully ported** to Drizzle, grouped by domain in `src/db/schema/` (identity,
skills, hackathons, kanban, cohor, feed, gamification, commerce, platform).
The complete init migration is `drizzle/0000_init_full_schema.sql`
(59 tables · 19 enums · 36 unique indexes · 49 CHECK constraints · PostGIS).
