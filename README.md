<div align="center">

# tikimiki

**An all-in-one platform for running and competing in hackathons.**

Organizations publish events, members apply solo or as a team, teams get a Discord-like server
with real-time chat and a Kanban board, projects get submitted and voted on, and results turn into
points, badges and leaderboard standings — all in one system.

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20+%20PostGIS-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socketdotio&logoColor=white)](https://socket.io)

</div>

---

## Table of contents

- [Why tikimiki](#why-tikimiki)
- [Actors and capabilities](#actors-and-capabilities)
- [System architecture](#system-architecture)
- [Monorepo layout](#monorepo-layout)
- [Backend module map](#backend-module-map)
- [Request lifecycle](#request-lifecycle)
- [Authentication and authorization](#authentication-and-authorization)
- [Data model](#data-model)
- [The hackathon lifecycle](#the-hackathon-lifecycle)
- [Applications](#applications)
- [Teams and matching](#teams-and-matching)
- [Cohor — servers, channels, real-time](#cohor--servers-channels-real-time)
- [Kanban](#kanban)
- [Projects, voting and results](#projects-voting-and-results)
- [Gamification: points, badges, store, games](#gamification-points-badges-store-games)
- [Premium](#premium)
- [Moderation and platform oversight](#moderation-and-platform-oversight)
- [Frontend architecture](#frontend-architecture)
- [External integrations](#external-integrations)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts reference](#scripts-reference)
- [Testing](#testing)
- [Project documentation](#project-documentation)
- [Known limitations](#known-limitations)
- [Team](#team)

---

## Why tikimiki

The hackathon ecosystem is scattered. A competitor hunts for events on one site, looks for
teammates on another, coordinates on Discord, tracks tasks in Trello and submits somewhere else —
with no guarantee the people they team up with actually have the skills the challenge needs.
Profiles are self-declared and unverified.

Organizers have the mirror problem: no central tool for applications, manual and subjective
selection, no visibility into team progress during the event, and no afterlife for the projects
once it ends.

tikimiki collapses that whole lifecycle into one system — creation and promotion, applications and
selection, team formation, communication, task tracking, submission, judging, audience voting,
results, and the reputation trail that follows a participant across events. The only external
tools you still need are GitHub and your editor.

---

## Actors and capabilities

Roles are **separate tables keyed on `users.user_id`**, not an enum column — a user row can carry
any combination of them, and `GET /api/v1/users/me` returns
`roles: { isAdmin, isMember, isOrganization }`.

```mermaid
flowchart TB
    Guest["<b>Guest</b><br/>unauthenticated"]
    Member["<b>Member</b><br/>members table"]
    Org["<b>Organization</b><br/>organizations table"]
    Admin["<b>Administrator</b><br/>administrators table"]

    Guest -->|"browse hackathons, view profiles,<br/>audience vote by fingerprint"| Public["Public surface"]
    Guest -->|register| Member
    Guest -->|"register + admin approval"| Org

    Member -->|"apply, form teams, chat, post,<br/>submit projects, earn points"| Core["Core platform"]
    Member -->|"assigned per hackathon"| Moderator["Moderator role<br/>on one hackathon's server"]
    Member -->|"buy with points"| Premium["Premium status"]

    Org -->|"create + manage hackathons,<br/>review applications, publish results"| Core
    Admin -->|"verify organizations, bans,<br/>reports, platform oversight"| Core
```

| Actor             | What it can do                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest**         | Browse hackathons and profiles, search, cast an audience vote (identified by a browser fingerprint)                                                                                     |
| **Member**        | Everything a guest can, plus: apply to hackathons, form/join teams, DM and group chat, post to the feed, submit projects, earn points and badges, buy cosmetics/merch, play daily games |
| **Moderator**     | A member granted server-level permissions on a specific hackathon's cohor server by the organizer                                                                                       |
| **Organization**  | Must be admin-verified before publishing. Creates and manages hackathons, defines the application form, approves/rejects applicants, assigns moderators, publishes official results     |
| **Administrator** | Verifies organizations, issues and lifts bans, resolves reports, sees platform-wide oversight                                                                                           |

---

## System architecture

```mermaid
flowchart LR
    subgraph Browser["Browser"]
        UI["Next.js 14 App Router<br/>React 18 · TS"]
        SIO["socket.io-client"]
    end

    subgraph Next["Next.js server :3000"]
        RSC["Server Components<br/>metadata + shell"]
        RW["rewrites()<br/>/api/v1/* · /uploads/*"]
    end

    subgraph API["NestJS API :4000"]
        CTRL["29 controllers<br/>~215 REST endpoints<br/>prefix /api/v1"]
        GUARD["JwtAuthGuard<br/>OptionalJwtAuthGuard<br/>AuthzService · RateLimitGuard"]
        SVC["Domain services"]
        GW["RealtimeGateway<br/>Socket.IO"]
        CRON["@nestjs/schedule<br/>3 cron schedulers"]
        STATIC["/uploads static"]
    end

    subgraph Data["Data"]
        PG[("PostgreSQL 16<br/>+ PostGIS<br/>71 tables")]
        REDIS[("Redis 7<br/>provisioned, unused")]
        DISK["uploads/ on disk"]
    end

    subgraph Ext["External"]
        GH["GitHub OAuth<br/>+ REST API v3"]
        GOOG["Google OAuth<br/>Maps embed · Calendar links"]
        LI["LinkedIn OIDC"]
        SMTP["SMTP via nodemailer"]
    end

    UI -->|"fetch, same origin"| RW
    RSC --> UI
    RW -->|proxy| CTRL
    SIO <-->|"WebSocket, JWT handshake"| GW
    CTRL --> GUARD --> SVC
    SVC -->|"Drizzle ORM"| PG
    SVC -->|"emit* after commit"| GW
    CRON --> SVC
    SVC --> DISK
    STATIC --> DISK
    SVC --> GH & GOOG & LI & SMTP
    API -.->|reserved| REDIS
```

**The one design decision that shapes everything else:** the browser only ever talks to
`localhost:3000`. `next.config.mjs` rewrites `/api/v1/*` and `/uploads/*` to the backend, so the
refresh cookie stays **first-party** and there is no CORS in the browser during development.

---

## Monorepo layout

pnpm workspaces, Node 22, three packages.

```
tikimiki/
├─ frontend/                 Next.js 14 App Router
│  ├─ src/app/               file-based routes (37 pages)
│  ├─ src/components/        shell · ui · cohor · hackathons · teams · popups · i18n · theme
│  ├─ src/lib/               api.ts (the only HTTP client) · socket.ts · store.ts · avatars/ · i18n/
│  ├─ e2e/                   Selenium specs (jest + raw webdriver)
│  └─ next.config.mjs        rewrites → backend
│
├─ backend/                  NestJS 10 API
│  ├─ src/<module>/          controller · service · dto (31 Nest modules)
│  ├─ src/common/            authz · points · cosmetics · mentions · zod pipe · rate limit
│  ├─ src/db/schema/         Drizzle schema, grouped by domain — source of truth
│  ├─ src/db/seed*.ts        demo dataset
│  ├─ drizzle/               31 generated SQL migrations + meta snapshots
│  ├─ test/unit/             17 Vitest unit specs
│  ├─ test/integration/      21 specs against a real tikimiki_test database
│  └─ uploads/               user-uploaded avatars, banners, video
│
├─ packages/types/           @tikimiki/types — shared FE↔BE contracts +
│                            the notification template registry (SR/EN)
│
├─ tests/selenium-*/         standalone UI test suites (IDE recording + webdriver)
├─ deliverables/prototype/   the original static HTML/CSS prototype
├─ docs/                     assignment, DB spec, 21 use-case specs, defense notes
└─ docker-compose.yml        postgres (postgis/postgis:16-3.4) + redis
```

---

## Backend module map

```mermaid
flowchart TB
    subgraph Platform["Platform primitives"]
        DB["DbModule<br/>@Global DRIZZLE provider"]
        RT["RealtimeModule<br/>Socket.IO gateway"]
        AZ["AuthzModule<br/>server roles + permissions"]
        HL["HealthModule"]
    end

    subgraph Identity["Identity"]
        AU["auth<br/>login · refresh · OAuth · email verify · reset"]
        US["users"]
        ST["settings<br/>privacy + notification prefs"]
        SO["social<br/>follows · friendships · blocks"]
    end

    subgraph Domain["Hackathon domain"]
        HK["hackathons"]
        AP["applications"]
        TM["teams"]
        MT["matching"]
        PR["projects"]
        VT["voting"]
        BO["bounties"]
        KB["kanban"]
    end

    subgraph Comms["Communication"]
        CH["chat<br/>channels · DMs · reactions"]
        NO["notifications"]
        MA["mail"]
    end

    subgraph Engage["Engagement + commerce"]
        PO["posts"]
        EN["engagement<br/>reactions · comments"]
        GA["games"]
        LB["leaderboard"]
        SR["store"]
        SU["subscriptions"]
    end

    subgraph Trust["Trust + safety"]
        AD["admin"]
        MO["moderation"]
        RE["reports"]
    end

    subgraph Misc["Support"]
        SE["search"]
        UP["uploads"]
        GI["github"]
    end

    DB -.->|injected everywhere| Identity & Domain & Comms & Engage & Trust & Misc
    HK --> AP --> TM --> PR --> VT
    TM --> MT
    TM --> KB
    HK -->|"creates server + channels"| CH
    AP -->|"grants membership"| AZ
    PR --> BO
    VT --> LB
    Domain --> NO --> RT
    CH --> RT
    KB --> RT
```

Every module follows the same three-file shape:

| File                     | Responsibility                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| `<module>.controller.ts` | Routes, guards, `@CurrentUser()`, Zod DTO validation via `ZodPipe` |
| `<module>.service.ts`    | Business logic, Drizzle queries, transactions, real-time emits     |
| `dto.ts`                 | Zod schemas + inferred request/response types                      |

---

## Request lifecycle

Learn this path and the rest of the codebase reads itself.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant A as lib/api.ts
    participant N as Next rewrites
    participant G as JwtAuthGuard
    participant C as Controller
    participant Z as ZodPipe
    participant S as Service
    participant D as PostgreSQL
    participant W as RealtimeGateway

    B->>A: apiCall("/applications", body)
    A->>A: attach Authorization: Bearer accessToken
    A->>N: fetch("/api/v1/applications") — same origin
    N->>G: proxy to :4000/api/v1/applications
    G->>G: verify JWT, reject typ ≠ "access"
    G->>C: req.user = { userId }
    C->>Z: validate body against Zod schema
    Z-->>C: typed DTO (or 400 with field errors)
    C->>S: service method
    S->>D: Drizzle query / transaction
    D-->>S: rows
    opt has real-time consequence
        S->>W: emitNotification / emitChannelMessage
        W-->>B: Socket.IO push to room
    end
    S-->>C: response DTO
    C-->>A: JSON
    alt 401 and retry allowed
        A->>N: POST /auth/refresh (httpOnly cookie)
        N-->>A: new access token
        A->>N: replay original request once
    end
    A-->>B: typed result
```

Two details worth calling out:

- **Auto-refresh is in exactly one place.** `frontend/src/lib/api.ts` wraps `fetch`; on a `401` it
  calls `/auth/refresh` and replays the request **once**. A `NO_RETRY` set
  (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`) prevents an infinite loop on
  the auth endpoints themselves, where a 401 is a meaningful answer.
- **WebSockets never persist anything.** A message is written to Postgres over REST first, and only
  then broadcast. The socket is a notification channel, so a message can never arrive at a client
  without already being durable.

---

## Authentication and authorization

Code: `backend/src/auth/*`, `backend/src/common/authz.service.ts`.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant F as Frontend
    participant API as AuthService
    participant DB as users table

    U->>F: email + password
    F->>API: POST /auth/login
    API->>DB: lookup user, argon2.verify(passwordHash)
    DB-->>API: ok
    API->>API: sign access JWT {sub, typ:"access"} — 15 min
    API->>API: sign refresh JWT {sub, typ:"refresh", ver} — 30 days
    API-->>F: access token in body
    API-->>F: Set-Cookie tikimiki_refresh (httpOnly, path=/api/v1/auth)

    Note over F: access token → localStorage<br/>refresh token → cookie the JS never sees

    U->>F: ...15 minutes later...
    F->>API: request with expired access token
    API-->>F: 401
    F->>API: POST /auth/refresh (cookie auto-sent)
    API->>DB: check payload.ver === users.tokenVersion
    alt version matches
        API-->>F: new access token + rotated refresh cookie
    else password was changed elsewhere
        API-->>F: 401 — every old device is logged out
    end
```

**Token design**

| Concern                       | Decision                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing              | argon2 via `@node-rs/argon2` — memory-hard, current recommendation over bcrypt                                                                                                                                            |
| Access token                  | JWT, 15 min (`JWT_ACCESS_TTL`), payload `{ sub, typ: "access" }`, kept in `localStorage` under `tikimiki_access`                                                                                                          |
| Refresh token                 | JWT, 30 days, in the `tikimiki_refresh` httpOnly cookie with `sameSite: "lax"` and **`path: "/api/v1/auth"`** — it isn't attached to ordinary API calls                                                                   |
| Rotation                      | Every refresh mints a new refresh token                                                                                                                                                                                   |
| Token type confusion          | `JwtAuthGuard` rejects any token whose `typ` isn't `"access"` — refresh, email-verify and password-reset tokens can't be presented as credentials                                                                         |
| Sign out everywhere           | `users.token_version`; the refresh token carries the `ver` it was minted with, so a password change bumps the column and invalidates every other device. Access tokens stay stateless and simply expire within 15 minutes |
| Email verify / password reset | Stateless signed links with their own TTLs (`EMAIL_VERIFY_TTL`, `PASSWORD_RESET_TTL`). Without SMTP configured, the link is returned as `devLink` and logged                                                              |

**Guards**

- `JwtAuthGuard` — authentication required.
- `OptionalJwtAuthGuard` — populates `req.user` if a valid token is present, otherwise proceeds as
  a guest. Used by public surfaces like `GET /search`, hackathon detail and audience voting.
- `AuthzService` — the cohor server permission model. Server roles → permissions →
  `server_role_permissions`, checked on both REST routes and WebSocket joins.
- `RateLimitGuard` — throttles abuse-prone endpoints.

**Organization signup is deliberately different:** registering an organization does **not** issue a
session. The account sits in `pendingApproval` until an administrator verifies it; only then does
login succeed. The `organizations` table enforces this with CHECK constraints — an `approved` row
must have `reviewed_by` and `reviewed_at`, a `rejected` row must additionally have a
`rejection_reason`, and a `pending` row must have none of them.

---

## Data model

**71 tables · 22 Postgres enums · 31 migrations**, authored as TypeScript in
`backend/src/db/schema/` and compiled to SQL by drizzle-kit. Conventions used throughout:

- **Soft delete** — a `deleted_at` column; every read filters `isNull(deletedAt)`, and unique
  indexes are partial (`WHERE deleted_at IS NULL`) so a withdrawn row doesn't block a new one.
- **CHECK constraints carry invariants** — date ordering, non-negative points, canonical friendship
  ordering (`user_id_a < user_id_b`, so a pair can't exist twice), review-consistency
  (`reviewed_at IS NULL) = (reviewed_by IS NULL`).
- **PostGIS** — `hackathons.coordinates` is a `geography(Point)` with a GiST index; physical and
  hybrid events are constrained to have both a location and coordinates.
- **Transactions** — registration, team application, hackathon creation and result publication each
  run inside `db.transaction`.

### Identity and social

```mermaid
erDiagram
    users ||--o| members : "is a"
    users ||--o| organizations : "is a"
    users ||--o| administrators : "is a"
    users ||--o| user_settings : "has"
    users ||--o{ user_bans : "receives"
    users ||--o{ follows : "follows"
    users ||--o{ user_blocks : "blocks"
    members ||--o{ friendships : "mutual"
    members ||--o{ member_skills : "has"
    skills ||--o{ member_skills : "referenced by"

    users {
        uuid user_id PK
        varchar username UK
        varchar email UK
        text password_hash
        bool is_email_verified
        text github_id "partial UK"
        text google_id "partial UK"
        text linkedin_id "partial UK"
        text github_access_token
        int token_version
        timestamptz deleted_at
    }
    members {
        uuid user_id PK,FK
        bigint points ">= 0"
    }
    organizations {
        uuid user_id PK,FK
        varchar name UK
        enum verification_status "pending|approved|rejected"
        uuid reviewed_by FK
        text rejection_reason
    }
    member_skills {
        uuid user_id PK,FK
        int skill_id PK,FK
        text source "github|manual"
        bool verified
    }
```

### Hackathon domain

```mermaid
erDiagram
    organizations ||--o{ hackathons : "publishes"
    hackathons ||--o{ application_questions : "custom form"
    hackathons ||--o{ applications : "receives"
    hackathons ||--o{ teams : "hosts"
    hackathons ||--o{ hackathon_prizes : "offers"
    hackathons ||--o{ bounties : "sponsors"
    hackathons ||--o{ hackathon_required_skills : "requires"
    hackathons ||--o{ votes : "audience"
    applications ||--o{ question_answers : "answers"
    applications }o--o| teams : "filed under"
    teams ||--o{ team_members : "roster"
    teams ||--o{ team_invitations : "sends"
    teams ||--o{ team_join_requests : "receives"
    teams ||--o{ projects : "builds"
    teams ||--o| kanban_boards : "tracks work on"
    projects ||--o{ hackathon_results : "placed"
    projects ||--o{ bounty_submissions : "enters"
    bounties ||--o{ bounty_submissions : "collects"

    hackathons {
        uuid hackathon_id PK
        uuid organization_id FK
        enum type "physical|virtual|hybrid"
        enum status "upcoming|ongoing|finished|cancelled"
        timestamptz starts_at
        timestamptz ends_at
        timestamptz registration_deadline
        timestamptz voting_opens_at
        timestamptz voting_closes_at
        int max_participants
        smallint min_team_size
        smallint max_team_size
        geography coordinates "GiST"
    }
    applications {
        uuid application_id PK
        uuid user_id FK
        uuid hackathon_id FK
        uuid team_id FK "nullable"
        enum status "pending|approved|rejected|waitlisted|withdrawn"
        uuid reviewed_by FK
        text rejection_reason
        timestamptz deleted_at
    }
    projects {
        uuid project_id PK
        uuid team_id FK
        enum status "draft|submitted|under_review|judged"
        text repository_url
        text video_url
        timestamptz submitted_at
    }
    hackathon_results {
        uuid result_id PK
        uuid project_id FK
        uuid bounty_id FK "nullable — sponsor track"
        int rank
        uuid prize_id FK
    }
```

### Cohor, gamification and commerce

```mermaid
erDiagram
    hackathons ||--|| servers : "auto-created with"
    servers ||--o{ channel_groups : "organizes"
    channel_groups ||--o{ channels : "contains"
    channels ||--o{ channel_messages : "holds"
    messages ||--o{ channel_messages : "polymorphic"
    messages ||--o{ direct_messages : "polymorphic"
    messages ||--o{ message_attachments : "has"
    messages ||--o{ message_reactions : "gets"
    conversations ||--o{ conversation_members : "between"
    conversations ||--o{ direct_messages : "holds"
    servers ||--o{ server_roles : "defines"
    server_roles ||--o{ server_role_permissions : "grants"
    permissions ||--o{ server_role_permissions : "granted by"
    server_roles ||--o{ user_roles : "assigned to"

    members ||--o{ point_transactions : "ledger"
    members ||--o{ user_badges : "earns"
    badges ||--o{ user_badges : "awarded as"
    members ||--o{ game_plays : "plays"
    games ||--o{ game_plays : "recorded in"
    members ||--o{ user_cosmetics : "owns"
    cosmetic_items ||--o{ user_cosmetics : "owned as"
    user_cosmetics ||--o| user_equipped_cosmetics : "equipped"
    members ||--o{ merch_orders : "places"
    merch_orders ||--o{ merch_order_items : "contains"
    merch_variants ||--o{ merch_order_items : "ordered as"
    members ||--o{ subscriptions : "premium"
    subscriptions ||--o{ subscription_payments : "billed"
```

Messages use a **polymorphic base table**: one `messages` row carries the author, body and
timestamps, and either a `channel_messages` or a `direct_messages` row binds it to its context.
Attachments and reactions therefore attach once, uniformly, to both kinds of message.

---

## The hackathon lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft : org saves progress<br/>(hackathon_drafts, JSON payload)
    draft --> upcoming : publish — validated, real row created,<br/>cohor server bootstrapped
    upcoming --> ongoing : cron — starts_at passed
    ongoing --> finished : cron — ends_at passed
    upcoming --> cancelled : organizer cancels
    ongoing --> cancelled : organizer cancels
    finished --> [*] : results published →<br/>points, badges, leaderboard

    note right of draft
        Drafts live as JSON so a
        half-filled form need not
        satisfy the NOT NULL and
        CHECK constraints on the
        real hackathons table.
    end note

    note right of ongoing
        hackathons-status.scheduler.ts
        runs @Cron every minute, with a
        backstop for transitions missed
        while the server was down.
    end note
```

End-to-end, the way a real event moves through the system:

```mermaid
sequenceDiagram
    autonumber
    participant O as Organization
    participant Sys as tikimiki
    participant M as Member
    participant T as Team
    participant Aud as Audience

    O->>Sys: POST /hackathons
    activate Sys
    Note over Sys: One transaction:<br/>hackathon + server +<br/>channel groups "OPŠTE" / "TIMOVI" +<br/>channels #opšte #najave #predaja-projekta +<br/>roles and permissions
    deactivate Sys

    O->>Sys: define application questions
    M->>Sys: POST /applications (+ answers)
    Sys-->>M: pending
    O->>Sys: PATCH /applications/:id/approve
    Sys->>Sys: capacity check vs max_participants
    Sys->>Sys: grantServerMembership → Participant role
    Sys-->>M: notification + email

    M->>Sys: create or join a team
    Sys->>Sys: #team-name channel added to the "TIMOVI" group
    Note over T: cron flips status → ongoing
    T->>Sys: create project, push repo URL, upload video
    T->>Sys: POST /projects/:id/submit (400 after the deadline)

    O->>Sys: open the voting window
    Aud->>Sys: vote (member id or guest fingerprint)
    Sys-->>Aud: live tally

    O->>Sys: POST /hackathons/:id/results
    Sys->>Sys: idempotent ledger writes — points per placement
    Sys->>Sys: award badges, notify every participant
    Sys-->>M: profile history + leaderboard updated
```

---

## Applications

Code: `backend/src/applications/`.

```mermaid
stateDiagram-v2
    [*] --> pending : member applies<br/>(required answers validated)
    pending --> approved : organizer approves<br/>(capacity checked here)
    pending --> rejected : organizer rejects (+ reason)
    pending --> waitlisted : organizer waitlists
    waitlisted --> approved : a spot opens
    pending --> withdrawn : applicant withdraws
    approved --> [*]
    rejected --> [*]
    withdrawn --> [*] : may apply again
```

The rules the module actually enforces:

| Rule                      | Behaviour                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Custom form**           | Each hackathon defines its own `application_questions`; `assertAnswersCompleteForm` rejects a submission missing any required answer → `400 All required questions must be answered`                                          |
| **No double application** | `409 You already have an active application`. "Active" excludes withdrawn and soft-deleted rows, so withdrawing frees you to reapply — backed by a partial unique index on `(user_id, hackathon_id) WHERE deleted_at IS NULL` |
| **Deadline**              | Past `registration_deadline` → `400 Registration is closed`                                                                                                                                                                   |
| **Capacity**              | Checked at **approval**, not application — applying is always allowed so waitlisting stays meaningful. Exceeding `max_participants` → `400 Hackathon is full`                                                                 |
| **Team application**      | `POST /applications/team` creates every member's application in one transaction; `approve-team` approves all open applications of the team with a **combined** capacity check — all or nothing                                |
| **Approval side effects** | `grantServerMembership` gives the applicant the Participant role on the hackathon's cohor server, and `notifyDecision` writes an in-app notification plus an email                                                            |
| **Two DTO perspectives**  | An applicant sees their own application; an organizer sees a candidate list enriched with profile, skills and answers                                                                                                         |

---

## Teams and matching

Teams live inside a hackathon and are bounded by its `min_team_size` / `max_team_size`. Membership
is negotiated in both directions — `team_invitations` (team → member) and `team_join_requests`
(member → team). Joining a team **auto-files a hackathon application** if the member doesn't
already have one, so team membership and event admission can't drift apart.

`matching/` implements SSU12, "AI team matching". To be precise about what it is: a **deterministic
complementarity scoring algorithm over verified skills in the database**, not an LLM call.

```mermaid
flowchart LR
    A["Free agents for this hackathon<br/>approved applicants, not on a team"] --> S
    B["Skills required by the hackathon"] --> S
    C["Skills already covered by the team"] --> S
    S["Score = how much a candidate<br/>covers what the team is missing"] --> D["GET /hackathons/:id/team-suggestions<br/>top 10 teammates · top 5 open teams"]
    S --> E["POST /hackathons/:id/team-proposal<br/>one assembled combination"]
```

The candidate pool is deliberately scoped to people **already approved onto that specific
hackathon** — every suggestion is someone who can actually be invited and can actually accept.
Skills themselves come from GitHub (see [External integrations](#external-integrations)) and carry
`source: "github", verified: true`, which is what makes the profile more trustworthy than a
self-declared skill list.

---

## Cohor — servers, channels, real-time

"Cohor" is the Discord-like layer: every hackathon gets a server the moment it's created, in the
same transaction, pre-populated with channel groups, channels, roles and permissions.

```
server (1:1 with hackathon)
├─ channel group "OPŠTE"
│  ├─ #opšte              general
│  ├─ #najave             announcements (organizer/moderator write)
│  └─ #predaja-projekta   project submission
└─ channel group "TIMOVI"
   └─ #<team-name>        one per team, restricted to its members
```

```mermaid
flowchart TB
    subgraph Client
        S1["socket.io-client<br/>io(url, { auth: { token } })"]
    end

    subgraph Gateway["RealtimeGateway"]
        HS["handshake: verify access JWT<br/>reject typ ≠ access"]
        JOIN["join handlers — every join is<br/>membership-checked against the DB"]
        PRES["presence map<br/>userId → connection count"]
    end

    subgraph Rooms["Socket.IO rooms"]
        R1["user:&lt;userId&gt;"]
        R2["server:&lt;serverId&gt;"]
        R3["channel:&lt;channelId&gt;"]
        R4["conversation:&lt;conversationId&gt;"]
        R5["board:&lt;boardId&gt;"]
    end

    S1 --> HS --> R1
    S1 -->|joinChannel joinServer joinConversation joinKanban| JOIN
    JOIN -->|authorized| R2 & R3 & R4 & R5
    JOIN -.->|"unauthorized → silently ignored"| X["no room joined"]
    HS --> PRES
```

| Direction       | Events                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client → server | `joinChannel` · `leaveChannel` · `joinServer` · `leaveServer` · `joinConversation` · `leaveConversation` · `joinKanban` · `leaveKanban` · `typing` · `getPresence` |
| Server → client | `channelMessage` · `directMessage` · `notification` · `messageReaction` · `messageEdited` · `messageDeleted` · `userTyping` · `presence` · `kanban:update`         |

Security properties worth knowing:

- The handshake verifies the **access** token specifically — a refresh token presented on the
  socket is rejected by its `typ` claim.
- Authorization is re-checked in the database on **every join**, not cached from the handshake. An
  unauthorized join is silently ignored rather than erroring, so a client can't probe for the
  existence of rooms.
- Presence counts connections per user, so several open tabs collapse into one "online".

---

## Kanban

Every team gets a board, created **lazily** by `ensureBoard(teamId)` the first time anyone opens it
— seeded with three columns ("To do", "In progress", "Done") the team is then free to rename,
reorder and extend. Cards move over REST, and the resulting state is broadcast to the
`board:<boardId>` room, so two teammates dragging cards see each other's changes live.

```mermaid
flowchart LR
    KB["kanban_boards<br/>one per team, lazily created"] --> KC["kanban_columns<br/>To do · In progress · Done<br/>renameable, reorderable"] --> KD["kanban_cards<br/>title · description · assignee · position"]
    KD -->|"REST mutation → DB → emit"| WS["kanban:update → board:&lt;id&gt;"]
```

---

## Projects, voting and results

**Submission.** A team creates a project, attaches a repository URL, and uploads a final video
presentation directly to the platform (`uploads/`, served from `/uploads/*`). `POST
/projects/:id/submit` flips it from `draft` to `submitted` — and returns `400` after the deadline.
A DB CHECK keeps that honest: `(status = 'draft') = (submitted_at IS NULL)`.

**Audience voting.** Optional, with an organizer-defined window (`voting_opens_at` /
`voting_closes_at`). Both members and **guests** may vote — a member vote is keyed by `user_id`, a
guest vote by a browser fingerprint, and the `chk_votes_voter_identity` constraint enforces that a
vote carries exactly one of the two. One vote per voter per hackathon; results tally live.

**Results.** `POST /hackathons/:hackathonId/results` (organizer-only, implemented in `bounties/`
alongside the sponsor tracks that share the results table) is **idempotent**:

```mermaid
flowchart TB
    R["Organizer publishes results"] --> TX["transaction"]
    TX --> W1["hackathon_results rows<br/>rank + prize per project"]
    TX --> W2["PointsService.credit per member<br/>type: hackathon_placement<br/>referenceId: the result"]
    TX --> W3["award badges e.g. Winner"]
    TX --> W4["notification hackathon_result_posted<br/>to every participant"]
    W2 --> LED[("point_transactions<br/>append-only ledger")]
    LED --> AGG["members.points aggregate"]
    W2 -.->|"republish? a transaction for this<br/>(type, referenceId) already exists → no-op"| LED
```

---

## Gamification: points, badges, store, games

**The points ledger is the pattern to understand.** `common/points.service.ts` is the single
chokepoint for changing a balance. Every `credit` / `debit` reads `members.points`, applies the
delta, writes the new balance, and appends one row to `point_transactions` — all on the
caller-supplied transaction handle, so the balance and the ledger entry commit atomically. `debit`
additionally refuses to go negative, mirroring the `chk_members_points_non_negative` DB constraint.

Idempotency falls out of it for free: "does a transaction of this `type` already exist for this
`referenceId`?" is the only question a re-publish has to ask.

Transaction types: `game_reward` · `badge_award` · `hackathon_placement` · `bounty_placement` ·
`merch_purchase` · `premium_purchase` · `admin_adjustment`.

```mermaid
flowchart LR
    subgraph Earn["Earn"]
        E1["hackathon placement"]
        E2["sponsor bounty placement"]
        E3["daily mini-games"]
        E4["badge awards"]
    end
    subgraph Ledger["PointsService"]
        L[("point_transactions<br/>append-only")]
        BAL["members.points"]
    end
    subgraph Spend["Spend"]
        S1["cosmetics — username effects,<br/>avatar decorations, banner effects"]
        S2["merch — items, variants, orders"]
        S3["premium status"]
    end
    Earn --> L --> BAL --> Spend --> L
    BAL --> LBD["leaderboard<br/>all-time · month · week"]
```

**Badges** (`badges` + `user_badges`) span participation, achievement, social and special
categories — awarded automatically on results, and by in-app achievements such as a flawless run of
the _Grupe_ mini-game (a Connections-style daily puzzle in `games/`, guarded so the achievement can
only be claimed once by the `user_badges` primary key).

**Store** sells cosmetics in four rarities and physical merch. Owned cosmetics are equipped through
`user_equipped_cosmetics` (one slot per `cosmetic_type`) and rendered from a hint the API returns
alongside the user.

---

## Premium

Code: `backend/src/subscriptions/`.

- One plan. There is **no real payment gateway** — purchase is simulated, paid in points.
- `isPremium(userId)` is the **only** source of truth: a `subscriptions` row with `status='active'`
  and `ends_at > now()`.
- Cancelling sets `cancel_at_period_end`; access continues until expiry. A cron
  (`subscriptions-expiry.scheduler.ts`) later moves expired rows to `cancelled`/`expired` — pure
  bookkeeping, since `isPremium` already stopped returning true.
- **Gating happens on read, not on write.** Premium personalization (animated GIF avatar, banner)
  is checked in `premium-personalization.ts` when a profile is rendered: `gatePremiumPersonalization`
  for single profiles, `gatedAvatarUrl` (a SQL `CASE`) for list queries. Losing premium never
  deletes your data — it just stops being served, and reactivating brings it straight back.

> **A bug worth documenting.** `gatedAvatarUrl` builds a correlated subquery
> (`NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = <owner>)`). In a **single-table**
> select, Drizzle rendered the interpolated column unqualified (`"user_id"`, not
> `"users"."user_id"`), so inside the subquery the name bound to `subscriptions s` — the predicate
> degenerated into the tautology `s.user_id = s.user_id` and the gate leaked as soon as _anyone_ on
> the platform held premium. JOIN queries (feed, chat) qualify their columns, so it only leaked on
> single-table paths like search. The fix qualifies the column explicitly via `getTableName` +
> `sql.identifier`. Lesson: ORM sugar over raw SQL can change the semantics of a correlated
> subquery — read the generated SQL.

---

## Moderation and platform oversight

```mermaid
flowchart TB
    U["Any user"] -->|"report user · post · comment ·<br/>message · hackathon"| RPT["reports<br/>category + status"]
    RPT --> ROUTE{"context"}
    ROUTE -->|"inside a hackathon server"| MOD["Hackathon moderator<br/>/moderator"]
    ROUTE -->|"platform-level"| ADM["Administrator<br/>/admin"]
    MOD --> ACT1["delete message · mute on server<br/>(server_mutes)"]
    ADM --> ACT2["temporary or permanent ban<br/>(user_bans)"]
    ADM --> ACT3["verify or reject organizations"]
    ACT1 & ACT2 --> AUD[("audit_log")]
    ACT2 --> APP["appeals"]
    ACT2 -->|"expires_at reached"| CRON["bans-expiry.scheduler.ts<br/>auto-lift"]
    RPT -->|resolved / dismissed| NOTIF["reporter is notified"]
```

`user_bans` carries a partial unique index — **at most one active ban per user**
(`WHERE lifted_at IS NULL`) — with `expires_at NULL` meaning permanent. Banned users land on
`/suspended`.

---

## Frontend architecture

**Routing.** Next.js 14 App Router, 37 pages. Each route is a thin **server** `page.tsx` that
exports `metadata` (so the `<title>` is real HTML, not a `useEffect`) and renders a co-located
`"use client"` component holding all state and handlers, plus a co-located stylesheet.

| Area         | Routes                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public       | `/` feed · `/about` · `/help` · `/terms` · `/privacy` · `/accessibility`                                                                                 |
| Auth         | `/login` · `/signup` · `/signup/organization` · `/verify-email` · `/reset-password` · `/suspended`                                                       |
| Hackathons   | `/hackathons` · `/hackathons/[id]` · `/hackathons/[id]/apply` · `/hackathons/[id]/edit` · `/hackathons/new` · `/hackathons/manage` · `/hackathons/teams` |
| Teams & work | `/teams` · `/teams/[teamId]/kanban` · `/applications`                                                                                                    |
| Social       | `/messages` · `/notifications` · `/search` · `/u/[username]` · `/profile`                                                                                |
| Cohor        | `/cohor` (full-screen, outside the app shell)                                                                                                            |
| Engagement   | `/leaderboard` · `/gamehub` · `/store` · `/premium`                                                                                                      |
| Admin        | `/admin` · `/moderator` · `/settings`                                                                                                                    |

**Shell.** `AppShell` composes a three-column grid — a locked left nav, the page's own `<main>`, and
a right rail (search, cohor card, DMs). Full-screen pages (auth, cohor, suspended) opt out entirely.

**Theming.** Four themes — default dark (violet `#5F4A8B` + lemon `#EDD94B`), `mono`, `light` and
`light-mono` — implemented as CSS custom properties redefined under `html[data-theme]`. No runtime
theme library; the tokens do the work.

**i18n.** A `useT(M)` hook where each component carries its own `{ en, sr }` dictionary, with
`LanguageProvider` holding the choice. Notification copy is centralized differently: the backend
writes `{ key, params }` and `packages/types/src/notifications.ts` holds the SR/EN templates.
`NotificationTemplateKey` is a union type, so a backend emitting an unknown key **fails the
TypeScript build** rather than shipping a blank notification.

**State.** No Redux/Zustand — a small `lib/store.ts`, React context providers (`AuthProvider`,
`LanguageProvider`, theme), and a `notificationsBus` for cross-component pushes.

**Identity visuals.** `lib/avatars/` generates deterministic procedural avatars — grid, gradient,
orbit, circuit and hex variants derived from the user id — so a user without an uploaded picture
still has a stable, distinctive one.

---

## External integrations

| Integration                 | Where                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub OAuth 2.0**        | `auth/oauth.service.ts`               | `authorize` → `code` → `access_token` → `GET /user` (plus `/user/emails` when the address is private). Scope `read:user user:email`. The token is stored on `users.github_access_token` for later skill verification                                                                                                                                                                                           |
| **GitHub REST API v3**      | `github/github.service.ts`            | Skill verification: `GET /user/repos?per_page=100&sort=pushed`, then `GET /repos/:owner/:repo/languages` for the five most active repos (byte-level language distribution; remaining repos counted by `repo.language`). Top languages are upserted into `member_skills` with `source: "github", verified: true`. `401` maps to `UnauthorizedException` (expired token), anything else to `BadGatewayException` |
| **Google OAuth 2.0 / OIDC** | `auth/oauth.service.ts`               | `accounts.google.com` → token → `oauth2/v2/userinfo`. Scope `openid email profile`                                                                                                                                                                                                                                                                                                                             |
| **LinkedIn OIDC**           | `auth/oauth.service.ts`               | Sign In with LinkedIn v2 → `api.linkedin.com/v2/userinfo`                                                                                                                                                                                                                                                                                                                                                      |
| **SMTP**                    | `mail/mail.service.ts`                | nodemailer. With no `SMTP_HOST`, mail is logged to the console instead of sent                                                                                                                                                                                                                                                                                                                                 |
| **Google Maps**             | `HackathonDetailClient.tsx`           | Location shown as an `output=embed` iframe — no API key required                                                                                                                                                                                                                                                                                                                                               |
| **Google Calendar**         | `components/popups/CalendarPopup.tsx` | Builds a `calendar.google.com/calendar/render` URL; a link, not an API call                                                                                                                                                                                                                                                                                                                                    |
| **Google Fonts**            | `app/layout.tsx`                      | Bricolage Grotesque + Space Grotesk                                                                                                                                                                                                                                                                                                                                                                            |

All three OAuth providers implement `isConfigured()` against their env vars and degrade gracefully:
with no keys the backend redirects to `/login?oauth=unconfigured` and the UI says so. `completeLogin`
find-or-creates a local user by provider id; `completeLink` (Settings → Connect) attaches an
identity to an **existing** account after a conflict check.

---

## Getting started

**Prerequisites:** Node ≥ 22, pnpm 9.15 (`corepack enable`), Docker Desktop.

```bash
git clone <repo-url> tikimiki
cd tikimiki

pnpm install                 # all three workspaces
cp env.example .env          # adjust secrets if you like; defaults work locally

pnpm db:up                   # start postgres + redis containers
pnpm db:migrate              # apply the 31 migrations
pnpm db:seed                 # demo dataset — users, hackathons, teams, posts

pnpm dev                     # frontend :3000 + backend :4000, in parallel
```

Shortcuts:

```bash
pnpm start:all               # db:up + dev
pnpm db:setup                # db:up + db:migrate + db:seed
```

Then open **http://localhost:3000**. Health check:

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok","db":true,...}
```

**Seeded accounts** — password `password123` for all of them:

| Account                                                                                 | Role                  |
| --------------------------------------------------------------------------------------- | --------------------- |
| `admin@tikimiki.dev`                                                                    | Administrator         |
| `org@tikimiki.dev`                                                                      | Verified organization |
| `andrej@tikimiki.dev`, `nenad@tikimiki.dev`, `mara@tikimiki.dev`, `fenjer@tikimiki.dev` | Members               |

**A good tour of the system:** sign in as the organization and create a hackathon with a custom
application question → apply as a member → approve them (watch the notification land and the
participant appear in the cohor server) → form a team and send a chat message with two browsers
open → submit a project → publish results → see points, the badge and the leaderboard update.

---

## Environment variables

Read and validated by Zod in `backend/src/config/env.ts`. Blank values behave as unset, so schema
defaults apply. `backend/.env` is loaded first, then the repo-root `.env`; **real environment
variables always win**, which is what pins the test suite to `tikimiki_test`.

| Variable                                            | Default                                                | Notes                                                         |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `NODE_ENV`                                          | `development`                                          | `development` · `test` · `production`                         |
| `PORT`                                              | `4000`                                                 | API port                                                      |
| `WEB_ORIGIN`                                        | `http://localhost:3000`                                | CORS allow-list                                               |
| `DATABASE_URL`                                      | `postgres://tikimiki:tikimiki@localhost:5432/tikimiki` |                                                               |
| `REDIS_URL`                                         | `redis://localhost:6379`                               | Reserved — see [Known limitations](#known-limitations)        |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`          | `change-me-*`                                          | **Change these outside development**                          |
| `JWT_ACCESS_TTL`                                    | `900`                                                  | 15 minutes                                                    |
| `JWT_REFRESH_TTL`                                   | `2592000`                                              | 30 days                                                       |
| `EMAIL_VERIFY_TTL`                                  | `86400`                                                | Verification link lifetime                                    |
| `PASSWORD_RESET_TTL`                                | `3600`                                                 | Reset link lifetime                                           |
| `OAUTH_REDIRECT_BASE`                               | `http://localhost:3000`                                | Public base the **browser** uses, i.e. through the Next proxy |
| `GITHUB_CLIENT_ID` / `_SECRET`                      | _(blank)_                                              | Blank disables the provider                                   |
| `GOOGLE_CLIENT_ID` / `_SECRET`                      | _(blank)_                                              | Blank disables the provider                                   |
| `LINKEDIN_CLIENT_ID` / `_SECRET`                    | _(blank)_                                              | Blank disables the provider                                   |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASS` / `_FROM` | _(blank)_ / `587`                                      | Blank host → mail logs to console                             |
| `BACKEND_ORIGIN`                                    | `http://localhost:4000`                                | Frontend-side; the rewrite target                             |

`docker-compose.yml` additionally reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`POSTGRES_PORT` and `REDIS_PORT` from the root `.env`.

---

## Scripts reference

Run from the repo root.

| Command                             | What it does                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                          | Frontend and backend in parallel                                     |
| `pnpm dev:web` / `pnpm dev:api`     | One side only                                                        |
| `pnpm start:all`                    | `db:up` then `dev`                                                   |
| `pnpm db:up` / `pnpm db:down`       | Postgres + Redis containers                                          |
| `pnpm db:generate`                  | Diff the Drizzle schema → new SQL migration                          |
| `pnpm db:migrate`                   | Apply pending migrations                                             |
| `pnpm db:seed`                      | Seed the demo dataset                                                |
| `pnpm db:setup`                     | up + migrate + seed                                                  |
| `pnpm build`                        | Build every workspace                                                |
| `pnpm lint` / `pnpm typecheck`      | ESLint · `tsc --noEmit` on both sides                                |
| `pnpm format` / `pnpm format:check` | Prettier                                                             |
| `pnpm test`                         | Every workspace's tests                                              |
| `pnpm test:unit`                    | Backend Vitest unit suite                                            |
| `pnpm test:ui`                      | Selenium WebDriver suite                                             |
| **`pnpm check`**                    | format:check + lint + typecheck + unit — **run this before pushing** |

Git hygiene: husky runs Prettier through lint-staged on pre-commit, and `scripts/install-hooks.sh`
installs a Gerrit-style `commit-msg` hook.

---

## Testing

```mermaid
flowchart LR
    U["<b>Unit</b> — Vitest<br/>backend/test/unit · 17 specs<br/>DTO schemas, controllers,<br/>schedulers, mail, services"] --> I
    I["<b>Integration</b> — Vitest + supertest<br/>backend/test/integration · 21 specs<br/>real HTTP against a real<br/>tikimiki_test database"] --> E
    E["<b>UI / E2E</b> — Selenium<br/>frontend/e2e + tests/selenium-*<br/>auth, applications, hackathons, kanban,<br/>chat, calendar, search, video upload"]
```

- **Unit** — `pnpm test:unit`. Pure logic and Zod contracts, no database.
- **Integration** — hit real endpoints against a real database. The Vitest setup presets
  `DATABASE_URL` to `tikimiki_test` **before** the env loader runs, which is exactly why the loader
  never overwrites existing values.
- **UI** — two suites: `frontend/e2e/` (jest + ts-jest for Selenium specs, plus raw WebDriver
  scripts) and the standalone `tests/selenium-webdriver/` runner with an accompanying Selenium IDE
  recording (`tests/selenium-ide/tikimiki.side`).

---

## Project documentation

`docs/` holds the coursework artefacts (in Serbian):

| Path                           | Contents                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `docs/project_assignment/`     | The project assignment — problem statement, actors, features, tech choices, phased plan |
| `docs/database_specification/` | Logical model and the full DB specification                                             |
| `docs/use_case_specification/` | 21 use-case specifications (SSU1–SSU21), `.docx` + `.pdf`                               |
| `docs/odbrana-priprema.md`     | Defense prep — a deep walkthrough of the implementation, module by module               |
| `deliverables/prototype/`      | The original static HTML/CSS prototype the frontend was built from                      |

Use-case numbers appear throughout the code as `SSU<n>` comments, tying an implementation back to
its specification.

---

## Known limitations

Stated plainly, because these are deliberate scope decisions rather than oversights:

- **Redis is provisioned but unused.** It's in `docker-compose.yml` and `REDIS_URL` is in the env
  schema, reserved for the Socket.IO adapter when the API needs to scale horizontally. No backend
  code reads it today.
- **"AI team matching" is a deterministic scoring algorithm** over verified skills, not an LLM.
- **Premium purchase is simulated** — there is no payment gateway.
- **Captcha is a visual placeholder** — no Turnstile/reCAPTCHA call behind it.
- **GitHub access tokens are stored in plaintext** (`users.github_access_token`) — flagged in the
  code and to be encrypted at rest before any production deployment.
- **Uploads go to local disk**, not object storage.
- **Access tokens live in `localStorage`.** They're short-lived (15 min) and the refresh token is
  out of reach in an httpOnly cookie, but moving the access token to memory-only would be stricter.

Scaling path, if it were needed: the API is stateless (JWT), so it scales horizontally behind a load
balancer; Socket.IO gets the Redis adapter that's already provisioned; Postgres gets read replicas;
uploads move to S3/CDN.

---

## Team

Built for _Principi softverskog inženjerstva_ (Principles of Software Engineering), School of
Electrical Engineering, University of Belgrade — team **digitalci**.

| Member              | Index     | Primary areas                                                  |
| ------------------- | --------- | -------------------------------------------------------------- |
| **Stevan Gnjato**   | 2023/0141 | Team lead · search                                             |
| **Andrej Čolić**    | 2023/0492 | Applications — custom forms, approve/reject, team applications |
| **Dimitrije Pešić** | 2023/0014 | Matching, premium personalization, end-to-end flow testing     |
| **Nenad Skoković**  | 2023/0039 | GitHub integration, mail, platform services                    |

Ownership is recorded as `Autor:` comments in the source; everything unmarked is shared work.
