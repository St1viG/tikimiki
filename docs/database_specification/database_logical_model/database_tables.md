# tikimiki — Database Schema v4.3

---

## 1. users

| Column            | Type         | PK  | FK  | Nullable |
| ----------------- | ------------ | --- | --- | -------- |
| user_id           | uuid         | ✓   |     |          |
| username          | varchar(32)  |     |     |          |
| email             | varchar(254) |     |     |          |
| password_hash     | text         |     |     |          |
| is_email_verified | boolean      |     |     |          |
| google_id         | text         |     |     | ✓        |
| github_id         | text         |     |     | ✓        |
| github_username   | varchar(39)  |     |     | ✓        |
| linkedin_id       | text         |     |     | ✓        |
| avatar_url        | text         |     |     | ✓        |
| banner_url        | text         |     |     | ✓        |
| bio               | text         |     |     | ✓        |
| last_login_at     | timestamptz  |     |     | ✓        |
| created_at        | timestamptz  |     |     |          |
| updated_at        | timestamptz  |     |     |          |
| deleted_at        | timestamptz  |     |     | ✓        |

```sql
CREATE TABLE users (
    user_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username          VARCHAR(32)  NOT NULL,
    email             VARCHAR(254) NOT NULL,
    password_hash     TEXT         NOT NULL,
    is_email_verified BOOLEAN      NOT NULL DEFAULT FALSE,
    google_id         TEXT,
    github_id         TEXT,
    github_username   VARCHAR(39),
    linkedin_id       TEXT,
    avatar_url        TEXT,
    banner_url        TEXT,
    bio               TEXT,
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,

    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email    UNIQUE (email)
);

CREATE UNIQUE INDEX uq_users_github_id_nn    ON users (github_id)       WHERE github_id       IS NOT NULL;
CREATE UNIQUE INDEX uq_users_google_id_nn    ON users (google_id)       WHERE google_id       IS NOT NULL;
CREATE UNIQUE INDEX uq_users_linkedin_id_nn  ON users (linkedin_id)     WHERE linkedin_id     IS NOT NULL;
CREATE UNIQUE INDEX uq_users_github_username ON users (github_username) WHERE github_username IS NOT NULL;
CREATE INDEX        idx_users_deleted        ON users (deleted_at)      WHERE deleted_at      IS NOT NULL;
```

---

## 2. administrators

| Column     | Type        | PK  | FK             | Nullable |
| ---------- | ----------- | --- | -------------- | -------- |
| user_id    | uuid        | ✓   | users          |          |
| granted_by | uuid        |     | administrators | ✓        |
| granted_at | timestamptz |     |                |          |

```sql
CREATE TABLE administrators (
    user_id    UUID        PRIMARY KEY REFERENCES users          (user_id) ON DELETE CASCADE,
    granted_by UUID        REFERENCES administrators (user_id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. members

| Column  | Type   | PK  | FK    | Nullable |
| ------- | ------ | --- | ----- | -------- |
| user_id | uuid   | ✓   | users |          |
| points  | bigint |     |       |          |

```sql
CREATE TABLE members (
    user_id UUID   PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
    points  BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT chk_members_points_non_negative CHECK (points >= 0)
);

CREATE INDEX idx_members_points ON members (points DESC);
```

---

## 4. organizations

| Column              | Type                    | PK  | FK             | Nullable |
| ------------------- | ----------------------- | --- | -------------- | -------- |
| user_id             | uuid                    | ✓   | users          |          |
| name                | varchar(100)            |     |                |          |
| website_url         | text                    |     |                | ✓        |
| logo_url            | text                    |     |                | ✓        |
| contact_email       | varchar(254)            |     |                | ✓        |
| verification_status | org_verification_status |     |                |          |
| reviewed_by         | uuid                    |     | administrators | ✓        |
| reviewed_at         | timestamptz             |     |                | ✓        |
| rejection_reason    | text                    |     |                | ✓        |

```sql
CREATE TYPE org_verification_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE organizations (
    user_id             UUID                    PRIMARY KEY REFERENCES users          (user_id) ON DELETE CASCADE,
    name                VARCHAR(100)            NOT NULL,
    website_url         TEXT,
    logo_url            TEXT,
    contact_email       VARCHAR(254),
    verification_status org_verification_status NOT NULL DEFAULT 'pending',
    reviewed_by         UUID                    REFERENCES administrators (user_id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    rejection_reason    TEXT,

    CONSTRAINT uq_organizations_name UNIQUE (name),

    CONSTRAINT chk_orgs_approved_fields CHECK (
        verification_status <> 'approved'
        OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT chk_orgs_rejected_fields CHECK (
        verification_status <> 'rejected'
        OR (rejection_reason IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT chk_orgs_pending_fields CHECK (
        verification_status <> 'pending'
        OR (reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
    )
);
```

---

## 5. user_bans

| Column    | Type        | PK  | FK             | Nullable |
| --------- | ----------- | --- | -------------- | -------- |
| ban_id    | uuid        | ✓   |                |          |
| user_id   | uuid        |     | users          |          |
| banned_by | uuid        |     | administrators |          |
| reason    | text        |     |                |          |
| banned_at | timestamptz |     |                |          |
| lifted_at | timestamptz |     |                | ✓        |
| lifted_by | uuid        |     | administrators | ✓        |

```sql
CREATE TABLE user_bans (
    ban_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID        NOT NULL REFERENCES users          (user_id) ON DELETE CASCADE,
    banned_by UUID        NOT NULL REFERENCES administrators (user_id) ON DELETE RESTRICT,
    reason    TEXT        NOT NULL,
    banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lifted_at TIMESTAMPTZ,
    lifted_by UUID        REFERENCES administrators (user_id) ON DELETE SET NULL,

    CONSTRAINT chk_user_bans_lift_consistency CHECK (
        (lifted_at IS NULL) = (lifted_by IS NULL)
    )
);

CREATE INDEX        idx_user_bans_user_id        ON user_bans (user_id);
CREATE UNIQUE INDEX uq_user_bans_active_per_user ON user_bans (user_id) WHERE lifted_at IS NULL;
```

---

## 6. follows

| Column      | Type        | PK  | FK    | Nullable |
| ----------- | ----------- | --- | ----- | -------- |
| follower_id | uuid        | ✓   | users |          |
| followee_id | uuid        | ✓   | users |          |
| created_at  | timestamptz |     |       |          |

```sql
CREATE TABLE follows (
    follower_id UUID        NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    followee_id UUID        NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (follower_id, followee_id),

    CONSTRAINT chk_follows_no_self CHECK (follower_id <> followee_id)
);

CREATE INDEX idx_follows_followee_id ON follows (followee_id);
```

---

## 7. friendships

| Column       | Type              | PK  | FK      | Nullable |
| ------------ | ----------------- | --- | ------- | -------- |
| user_id_a    | uuid              | ✓   | members |          |
| user_id_b    | uuid              | ✓   | members |          |
| requester_id | uuid              |     | members |          |
| status       | friendship_status |     |         |          |
| requested_at | timestamptz       |     |         |          |
| responded_at | timestamptz       |     |         | ✓        |

```sql
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted');

CREATE TABLE friendships (
    user_id_a    UUID              NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    user_id_b    UUID              NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    requester_id UUID              NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    status       friendship_status NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,

    PRIMARY KEY (user_id_a, user_id_b),

    CONSTRAINT chk_friendships_canonical_order CHECK (user_id_a < user_id_b),
    CONSTRAINT chk_friendships_requester CHECK (
        requester_id = user_id_a OR requester_id = user_id_b
    ),
    CONSTRAINT chk_friendships_responded_consistency CHECK (
        (status = 'accepted') = (responded_at IS NOT NULL)
    )
);

CREATE INDEX idx_friendships_user_id_b ON friendships (user_id_b);
CREATE INDEX idx_friendships_requester ON friendships (requester_id);
```

> A friendship is stored as a single row per pair, with `user_id_a < user_id_b`
> enforced so the same pair cannot be inserted twice in opposite directions.
> `requester_id` records who sent the request; `status` tracks `pending` → `accepted`.
> A declined / cancelled request is simply deleted.

---

## 8. skills

| Column   | Type         | PK  | FK  | Nullable |
| -------- | ------------ | --- | --- | -------- |
| skill_id | uuid         | ✓   |     |          |
| name     | varchar(100) |     |     |          |
| category | varchar(50)  |     |     | ✓        |

```sql
CREATE TABLE skills (
    skill_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name     VARCHAR(100) NOT NULL,
    category VARCHAR(50),

    CONSTRAINT uq_skills_name UNIQUE (name)
);
```

---

## 9. member_skills

| Column   | Type | PK  | FK      | Nullable |
| -------- | ---- | --- | ------- | -------- |
| user_id  | uuid | ✓   | members |          |
| skill_id | uuid | ✓   | skills  |          |

```sql
CREATE TABLE member_skills (
    user_id  UUID NOT NULL REFERENCES members (user_id)  ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills  (skill_id) ON DELETE CASCADE,

    PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX idx_member_skills_skill_id ON member_skills (skill_id);
```

---

## 10. hackathons

| Column                | Type                   | PK  | FK            | Nullable |
| --------------------- | ---------------------- | --- | ------------- | -------- |
| hackathon_id          | uuid                   | ✓   |               |          |
| organization_id       | uuid                   |     | organizations |          |
| title                 | varchar(200)           |     |               |          |
| description           | text                   |     |               |          |
| type                  | hackathon_type         |     |               |          |
| status                | hackathon_status       |     |               |          |
| theme                 | varchar(100)           |     |               | ✓        |
| starts_at             | timestamptz            |     |               |          |
| ends_at               | timestamptz            |     |               |          |
| registration_deadline | timestamptz            |     |               |          |
| max_participants      | integer                |     |               | ✓        |
| min_team_size         | smallint               |     |               |          |
| max_team_size         | smallint               |     |               |          |
| location              | varchar(200)           |     |               | ✓        |
| coordinates           | geography(Point, 4326) |     |               | ✓        |
| logo_url              | text                   |     |               | ✓        |
| banner_url            | text                   |     |               | ✓        |
| created_at            | timestamptz            |     |               |          |
| updated_at            | timestamptz            |     |               |          |
| deleted_at            | timestamptz            |     |               | ✓        |

```sql
CREATE TYPE hackathon_type   AS ENUM ('physical', 'virtual', 'hybrid');
CREATE TYPE hackathon_status AS ENUM ('upcoming', 'ongoing', 'finished', 'cancelled');

CREATE TABLE hackathons (
    hackathon_id          UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID                   NOT NULL REFERENCES organizations (user_id),
    title                 VARCHAR(200)           NOT NULL,
    description           TEXT                   NOT NULL,
    type                  hackathon_type         NOT NULL,
    status                hackathon_status       NOT NULL DEFAULT 'upcoming',
    theme                 VARCHAR(100),
    starts_at             TIMESTAMPTZ            NOT NULL,
    ends_at               TIMESTAMPTZ            NOT NULL,
    registration_deadline TIMESTAMPTZ            NOT NULL,
    max_participants      INTEGER,
    min_team_size         SMALLINT               NOT NULL DEFAULT 1,
    max_team_size         SMALLINT               NOT NULL,
    location              VARCHAR(200),
    coordinates           GEOGRAPHY(Point, 4326),
    logo_url              TEXT,
    banner_url            TEXT,
    created_at            TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,

    CONSTRAINT chk_hackathons_dates CHECK (
        starts_at < ends_at
    ),
    CONSTRAINT chk_hackathons_registration_deadline CHECK (
        registration_deadline < starts_at
    ),
    CONSTRAINT chk_hackathons_max_participants CHECK (
        max_participants IS NULL OR max_participants > 0
    ),
    CONSTRAINT chk_hackathons_team_size CHECK (
        min_team_size >= 1 AND max_team_size >= min_team_size
    ),
    CONSTRAINT chk_hackathons_physical_location CHECK (
        type = 'virtual' OR (location IS NOT NULL AND coordinates IS NOT NULL)
    )
);

CREATE INDEX idx_hackathons_organization_id ON hackathons (organization_id);
CREATE INDEX idx_hackathons_status          ON hackathons (status);
CREATE INDEX idx_hackathons_starts_at       ON hackathons (starts_at);
CREATE INDEX idx_hackathons_coordinates     ON hackathons USING GIST (coordinates);
```

---

## 11. hackathon_required_skills

| Column       | Type | PK  | FK         | Nullable |
| ------------ | ---- | --- | ---------- | -------- |
| hackathon_id | uuid | ✓   | hackathons |          |
| skill_id     | uuid | ✓   | skills     |          |

```sql
CREATE TABLE hackathon_required_skills (
    hackathon_id UUID NOT NULL REFERENCES hackathons (hackathon_id) ON DELETE CASCADE,
    skill_id     UUID NOT NULL REFERENCES skills     (skill_id)     ON DELETE CASCADE,

    PRIMARY KEY (hackathon_id, skill_id)
);

CREATE INDEX idx_hackathon_required_skills_skill_id ON hackathon_required_skills (skill_id);
```

---

## 12. bounties

| Column       | Type         | PK  | FK         | Nullable |
| ------------ | ------------ | --- | ---------- | -------- |
| bounty_id    | uuid         | ✓   |            |          |
| hackathon_id | uuid         |     | hackathons |          |
| sponsor_name | varchar(100) |     |            |          |
| title        | varchar(200) |     |            |          |
| theme        | varchar(100) |     |            | ✓        |
| description  | text         |     |            | ✓        |
| created_at   | timestamptz  |     |            |          |
| updated_at   | timestamptz  |     |            |          |

```sql
CREATE TABLE bounties (
    bounty_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID         NOT NULL REFERENCES hackathons (hackathon_id) ON DELETE CASCADE,
    sponsor_name VARCHAR(100) NOT NULL,
    title        VARCHAR(200) NOT NULL,
    theme        VARCHAR(100),
    description  TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bounties_hackathon_id ON bounties (hackathon_id);
```

---

## 13. hackathon_prizes

| Column       | Type         | PK  | FK         | Nullable |
| ------------ | ------------ | --- | ---------- | -------- |
| prize_id     | uuid         | ✓   |            |          |
| hackathon_id | uuid         |     | hackathons |          |
| bounty_id    | uuid         |     | bounties   | ✓        |
| sponsor_name | varchar(100) |     |            | ✓        |
| title        | varchar(200) |     |            |          |
| description  | text         |     |            | ✓        |
| rank         | smallint     |     |            | ✓        |
| award_value  | text         |     |            | ✓        |

```sql
CREATE TABLE hackathon_prizes (
    prize_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID         NOT NULL REFERENCES hackathons (hackathon_id) ON DELETE CASCADE,
    bounty_id    UUID         REFERENCES bounties (bounty_id) ON DELETE CASCADE,
    sponsor_name VARCHAR(100),
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    rank         SMALLINT,
    award_value  TEXT,

    CONSTRAINT chk_prizes_rank CHECK (rank IS NULL OR rank > 0)
);

CREATE UNIQUE INDEX uq_prizes_hackathon_rank ON hackathon_prizes (hackathon_id, rank) WHERE bounty_id IS NULL     AND rank IS NOT NULL;
CREATE UNIQUE INDEX uq_prizes_bounty_rank    ON hackathon_prizes (bounty_id,    rank) WHERE bounty_id IS NOT NULL AND rank IS NOT NULL;
CREATE INDEX        idx_hackathon_prizes_hackathon_id ON hackathon_prizes (hackathon_id);
```

---

## 14. teams

| Column       | Type         | PK  | FK         | Nullable |
| ------------ | ------------ | --- | ---------- | -------- |
| team_id      | uuid         | ✓   |            |          |
| hackathon_id | uuid         |     | hackathons |          |
| name         | varchar(100) |     |            |          |
| created_at   | timestamptz  |     |            |          |
| updated_at   | timestamptz  |     |            |          |
| deleted_at   | timestamptz  |     |            | ✓        |

```sql
CREATE TABLE teams (
    team_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID         NOT NULL REFERENCES hackathons (hackathon_id),
    name         VARCHAR(100) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_teams_name_per_hackathon ON teams (hackathon_id, name) WHERE deleted_at IS NULL;
CREATE INDEX        idx_teams_hackathon_id ON teams (hackathon_id);
```

---

## 15. team_members

| Column     | Type        | PK  | FK      | Nullable |
| ---------- | ----------- | --- | ------- | -------- |
| team_id    | uuid        | ✓   | teams   |          |
| user_id    | uuid        | ✓   | members |          |
| role       | team_role   |     |         |          |
| joined_at  | timestamptz |     |         |          |
| left_at    | timestamptz |     |         | ✓        |
| deleted_at | timestamptz |     |         | ✓        |

```sql
CREATE TYPE team_role AS ENUM ('leader', 'member');

CREATE TABLE team_members (
    team_id    UUID        NOT NULL REFERENCES teams   (team_id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    role       team_role   NOT NULL DEFAULT 'member',
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at    TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    PRIMARY KEY (team_id, user_id),

    CONSTRAINT chk_team_members_exit_consistency CHECK (
        NOT (left_at IS NOT NULL AND deleted_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_team_one_leader       ON team_members (team_id) WHERE role = 'leader' AND deleted_at IS NULL;
CREATE INDEX        idx_team_members_user_id ON team_members (user_id);
```

---

## 16. applications

| Column           | Type               | PK  | FK         | Nullable |
| ---------------- | ------------------ | --- | ---------- | -------- |
| application_id   | uuid               | ✓   |            |          |
| user_id          | uuid               |     | members    |          |
| hackathon_id     | uuid               |     | hackathons |          |
| team_id          | uuid               |     | teams      | ✓        |
| status           | application_status |     |            |          |
| reviewed_by      | uuid               |     | users      | ✓        |
| reviewed_at      | timestamptz        |     |            | ✓        |
| rejection_reason | text               |     |            | ✓        |
| created_at       | timestamptz        |     |            |          |
| updated_at       | timestamptz        |     |            |          |
| deleted_at       | timestamptz        |     |            | ✓        |

```sql
CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected', 'waitlisted', 'withdrawn');

CREATE TABLE applications (
    application_id   UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID               NOT NULL REFERENCES members    (user_id),
    hackathon_id     UUID               NOT NULL REFERENCES hackathons (hackathon_id),
    team_id          UUID               REFERENCES teams (team_id) ON DELETE SET NULL,
    status           application_status NOT NULL DEFAULT 'pending',
    reviewed_by      UUID               REFERENCES users (user_id) ON DELETE SET NULL,
    reviewed_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,

    CONSTRAINT chk_applications_review_consistency CHECK (
        (reviewed_at IS NULL) = (reviewed_by IS NULL)
    ),
    CONSTRAINT chk_applications_rejection_reason CHECK (
        rejection_reason IS NULL OR status = 'rejected'
    )
);

CREATE UNIQUE INDEX uq_applications_user_hackathon    ON applications (user_id, hackathon_id) WHERE deleted_at IS NULL;
CREATE INDEX        idx_applications_user_id          ON applications (user_id);
CREATE INDEX idx_applications_hackathon_id     ON applications (hackathon_id);
CREATE INDEX idx_applications_hackathon_status ON applications (hackathon_id, status);
```

---

## 17. projects

| Column         | Type           | PK  | FK    | Nullable |
| -------------- | -------------- | --- | ----- | -------- |
| project_id     | uuid           | ✓   |       |          |
| team_id        | uuid           |     | teams |          |
| status         | project_status |     |       |          |
| title          | varchar(200)   |     |       |          |
| description    | text           |     |       | ✓        |
| repository_url | text           |     |       | ✓        |
| video_url      | text           |     |       | ✓        |
| submitted_at   | timestamptz    |     |       | ✓        |
| created_at     | timestamptz    |     |       |          |
| updated_at     | timestamptz    |     |       |          |
| deleted_at     | timestamptz    |     |       | ✓        |

```sql
CREATE TYPE project_status AS ENUM ('draft', 'submitted', 'under_review', 'judged');

CREATE TABLE projects (
    project_id     UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id        UUID           NOT NULL REFERENCES teams (team_id),
    status         project_status NOT NULL DEFAULT 'draft',
    title          VARCHAR(200)   NOT NULL,
    description    TEXT,
    repository_url TEXT,
    video_url      TEXT,
    submitted_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,

    CONSTRAINT chk_projects_submitted_consistency CHECK (
        (status = 'draft') = (submitted_at IS NULL)
    )
);

CREATE INDEX        idx_projects_team_id ON projects (team_id);
```

---

## 18. hackathon_results

| Column     | Type    | PK  | FK               | Nullable |
| ---------- | ------- | --- | ---------------- | -------- |
| result_id  | uuid    | ✓   |                  |          |
| project_id | uuid    |     | projects         |          |
| bounty_id  | uuid    |     | bounties         | ✓        |
| rank       | integer |     |                  | ✓        |
| prize_id   | uuid    |     | hackathon_prizes | ✓        |

```sql
CREATE TABLE hackathon_results (
    result_id  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID    NOT NULL REFERENCES projects         (project_id) ON DELETE CASCADE,
    bounty_id  UUID             REFERENCES bounties         (bounty_id)  ON DELETE CASCADE,
    rank       INTEGER,
    prize_id   UUID             REFERENCES hackathon_prizes (prize_id)   ON DELETE SET NULL,

    CONSTRAINT chk_hackathon_results_rank CHECK (rank IS NULL OR rank > 0)
);

CREATE UNIQUE INDEX uq_hackathon_results_project     ON hackathon_results (project_id)            WHERE bounty_id IS NULL;
CREATE UNIQUE INDEX uq_hackathon_results_bounty      ON hackathon_results (project_id, bounty_id) WHERE bounty_id IS NOT NULL;
CREATE UNIQUE INDEX uq_hackathon_results_bounty_rank ON hackathon_results (bounty_id, rank)        WHERE bounty_id IS NOT NULL AND rank IS NOT NULL;
CREATE INDEX        idx_hackathon_results_bounty_id  ON hackathon_results (bounty_id)              WHERE bounty_id IS NOT NULL;
```

---

## 19. bounty_submissions

| Column     | Type | PK  | FK       | Nullable |
| ---------- | ---- | --- | -------- | -------- |
| bounty_id  | uuid | ✓   | bounties |          |
| project_id | uuid | ✓   | projects |          |

```sql
CREATE TABLE bounty_submissions (
    bounty_id    UUID        NOT NULL REFERENCES bounties (bounty_id)  ON DELETE CASCADE,
    project_id   UUID        NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,

    PRIMARY KEY (bounty_id, project_id)
);

CREATE INDEX idx_bounty_submissions_project_id ON bounty_submissions (project_id);
```

---

## 20. votes

| Column            | Type        | PK  | FK         | Nullable |
| ----------------- | ----------- | --- | ---------- | -------- |
| vote_id           | uuid        | ✓   |            |          |
| hackathon_id      | uuid        |     | hackathons |          |
| project_id        | uuid        |     | projects   |          |
| voter_id          | uuid        |     | users      | ✓        |
| voter_fingerprint | text        |     |            | ✓        |
| created_at        | timestamptz |     |            |          |

```sql
CREATE TABLE votes (
    vote_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id      UUID        NOT NULL REFERENCES hackathons (hackathon_id) ON DELETE CASCADE,
    project_id        UUID        NOT NULL REFERENCES projects   (project_id)   ON DELETE CASCADE,
    voter_id          UUID        REFERENCES users (user_id) ON DELETE CASCADE,
    voter_fingerprint TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_votes_voter_identity CHECK (
        (voter_id IS NULL) <> (voter_fingerprint IS NULL)
    )
);

CREATE UNIQUE INDEX uq_votes_member_per_hackathon ON votes (hackathon_id, voter_id)          WHERE voter_id          IS NOT NULL;
CREATE UNIQUE INDEX uq_votes_guest_per_hackathon  ON votes (hackathon_id, voter_fingerprint) WHERE voter_fingerprint IS NOT NULL;
CREATE INDEX        idx_votes_project_id          ON votes (project_id);
```

> Audience "People's Choice" vote (F-18), tracked separately from judge decisions
> in `hackathon_results`. Exactly one of `voter_id` (a logged-in user) or
> `voter_fingerprint` (a signed guest/device token hash) is set. The two partial
> unique indexes enforce one vote per hackathon per member and per guest;
> tallies are aggregated by `project_id`.

---

## 21. kanban_boards

| Column     | Type        | PK  | FK    | Nullable |
| ---------- | ----------- | --- | ----- | -------- |
| board_id   | uuid        | ✓   |       |          |
| team_id    | uuid        |     | teams |          |
| created_at | timestamptz |     |       |          |
| updated_at | timestamptz |     |       |          |

```sql
CREATE TABLE kanban_boards (
    board_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID        NOT NULL REFERENCES teams (team_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_kanban_boards_team UNIQUE (team_id)
);
```

---

## 22. kanban_columns

| Column     | Type         | PK  | FK            | Nullable |
| ---------- | ------------ | --- | ------------- | -------- |
| column_id  | uuid         | ✓   |               |          |
| board_id   | uuid         |     | kanban_boards |          |
| name       | varchar(100) |     |               |          |
| position   | real         |     |               |          |
| created_at | timestamptz  |     |               |          |
| updated_at | timestamptz  |     |               |          |

```sql
CREATE TABLE kanban_columns (
    column_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id   UUID         NOT NULL REFERENCES kanban_boards (board_id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    position   REAL         NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_kanban_columns_position CHECK (position >= 0.0)
);

CREATE INDEX idx_kanban_columns_board_id ON kanban_columns (board_id);
```

---

## 23. kanban_cards

| Column      | Type         | PK  | FK             | Nullable |
| ----------- | ------------ | --- | -------------- | -------- |
| card_id     | uuid         | ✓   |                |          |
| column_id   | uuid         |     | kanban_columns |          |
| created_by  | uuid         |     | members        |          |
| assigned_to | uuid         |     | members        | ✓        |
| title       | varchar(200) |     |                |          |
| description | text         |     |                | ✓        |
| position    | real         |     |                |          |
| due_at      | timestamptz  |     |                | ✓        |
| created_at  | timestamptz  |     |                |          |
| updated_at  | timestamptz  |     |                |          |
| deleted_at  | timestamptz  |     |                | ✓        |

```sql
CREATE TABLE kanban_cards (
    card_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    column_id   UUID         NOT NULL REFERENCES kanban_columns (column_id) ON DELETE CASCADE,
    created_by  UUID         NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    assigned_to UUID         REFERENCES members (user_id) ON DELETE SET NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    position    REAL         NOT NULL DEFAULT 0.0,
    due_at      TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT chk_kanban_cards_position CHECK (position >= 0.0)
);

CREATE UNIQUE INDEX uq_kanban_cards_active_position ON kanban_cards (column_id, position) WHERE deleted_at IS NULL;
CREATE INDEX        idx_kanban_cards_column_id       ON kanban_cards (column_id);
CREATE INDEX        idx_kanban_cards_assigned_to     ON kanban_cards (assigned_to);
```

---

## 24. servers

| Column       | Type         | PK  | FK         | Nullable |
| ------------ | ------------ | --- | ---------- | -------- |
| server_id    | uuid         | ✓   |            |          |
| hackathon_id | uuid         |     | hackathons |          |
| name         | varchar(200) |     |            |          |
| logo_url     | text         |     |            | ✓        |
| banner_url   | text         |     |            | ✓        |
| created_at   | timestamptz  |     |            |          |
| updated_at   | timestamptz  |     |            |          |

```sql
CREATE TABLE servers (
    server_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID         NOT NULL REFERENCES hackathons (hackathon_id),
    name         VARCHAR(200) NOT NULL,
    logo_url     TEXT,
    banner_url   TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_servers_hackathon UNIQUE (hackathon_id)
);
```

---

## 25. server_roles

| Column         | Type         | PK  | FK      | Nullable |
| -------------- | ------------ | --- | ------- | -------- |
| server_role_id | uuid         | ✓   |         |          |
| server_id      | uuid         |     | servers |          |
| name           | varchar(100) |     |         |          |
| created_at     | timestamptz  |     |         |          |

```sql
CREATE TABLE server_roles (
    server_role_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id      UUID         NOT NULL REFERENCES servers (server_id) ON DELETE CASCADE,
    name           VARCHAR(100) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_server_roles_name_per_server UNIQUE (server_id, name)
);

CREATE INDEX idx_server_roles_server_id ON server_roles (server_id);
```

---

## 26. permissions

| Column        | Type         | PK  | FK  | Nullable |
| ------------- | ------------ | --- | --- | -------- |
| permission_id | uuid         | ✓   |     |          |
| name          | varchar(100) |     |     |          |
| description   | text         |     |     |          |

```sql
CREATE TABLE permissions (
    permission_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    description   TEXT         NOT NULL,

    CONSTRAINT uq_permissions_name UNIQUE (name)
);
```

---

## 27. server_role_permissions

| Column         | Type | PK  | FK           | Nullable |
| -------------- | ---- | --- | ------------ | -------- |
| server_role_id | uuid | ✓   | server_roles |          |
| permission_id  | uuid | ✓   | permissions  |          |

```sql
CREATE TABLE server_role_permissions (
    server_role_id UUID NOT NULL REFERENCES server_roles (server_role_id) ON DELETE CASCADE,
    permission_id  UUID NOT NULL REFERENCES permissions  (permission_id)  ON DELETE CASCADE,

    PRIMARY KEY (server_role_id, permission_id)
);

CREATE INDEX idx_server_role_permissions_permission_id ON server_role_permissions (permission_id);
```

---

## 28. user_roles

| Column         | Type        | PK  | FK           | Nullable |
| -------------- | ----------- | --- | ------------ | -------- |
| server_role_id | uuid        | ✓   | server_roles |          |
| user_id        | uuid        | ✓   | members      |          |
| assigned_by    | uuid        |     | users        | ✓        |
| assigned_at    | timestamptz |     |              |          |

```sql
CREATE TABLE user_roles (
    server_role_id UUID        NOT NULL REFERENCES server_roles (server_role_id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES members       (user_id)        ON DELETE CASCADE,
    assigned_by    UUID        REFERENCES users (user_id) ON DELETE SET NULL,
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (server_role_id, user_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);
```

---

## 29. channel_groups

| Column     | Type         | PK  | FK      | Nullable |
| ---------- | ------------ | --- | ------- | -------- |
| group_id   | uuid         | ✓   |         |          |
| server_id  | uuid         |     | servers |          |
| name       | varchar(100) |     |         |          |
| position   | real         |     |         |          |
| created_at | timestamptz  |     |         |          |
| updated_at | timestamptz  |     |         |          |

```sql
CREATE TABLE channel_groups (
    group_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id  UUID         NOT NULL REFERENCES servers (server_id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    position   REAL         NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_channel_groups_name_per_server UNIQUE (server_id, name),
    CONSTRAINT chk_channel_groups_position       CHECK  (position >= 0.0)
);

CREATE UNIQUE INDEX uq_channel_groups_position_per_server ON channel_groups (server_id, position);
CREATE INDEX        idx_channel_groups_server_id           ON channel_groups (server_id);
```

---

## 30. channels

| Column     | Type         | PK  | FK             | Nullable |
| ---------- | ------------ | --- | -------------- | -------- |
| channel_id | uuid         | ✓   |                |          |
| group_id   | uuid         |     | channel_groups |          |
| team_id    | uuid         |     | teams          | ✓        |
| type       | channel_type |     |                |          |
| name       | varchar(100) |     |                |          |
| position   | real         |     |                |          |
| created_at | timestamptz  |     |                |          |
| updated_at | timestamptz  |     |                |          |
| deleted_at | timestamptz  |     |                | ✓        |

```sql
CREATE TYPE channel_type AS ENUM ('general', 'announcements', 'team', 'private');

CREATE TABLE channels (
    channel_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID         NOT NULL REFERENCES channel_groups (group_id) ON DELETE CASCADE,
    team_id    UUID         REFERENCES teams          (team_id),
    type       channel_type NOT NULL,
    name       VARCHAR(100) NOT NULL,
    position   REAL         NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT uq_channels_name_per_group  UNIQUE (group_id, name),
    CONSTRAINT chk_channels_team_consistency CHECK (
        (type = 'team') = (team_id IS NOT NULL)
    ),
    CONSTRAINT chk_channels_position       CHECK (position >= 0.0)
);

CREATE UNIQUE INDEX uq_channels_active_position_per_group ON channels (group_id, position) WHERE deleted_at IS NULL;
CREATE INDEX        idx_channels_group_id                  ON channels (group_id);
```

---

## 31. messages

| Column      | Type        | PK  | FK       | Nullable |
| ----------- | ----------- | --- | -------- | -------- |
| message_id  | uuid        | ✓   |          |          |
| sender_id   | uuid        |     | users    |          |
| reply_to_id | uuid        |     | messages | ✓        |
| content     | text        |     |          |          |
| sent_at     | timestamptz |     |          |          |
| edited_at   | timestamptz |     |          | ✓        |
| deleted_at  | timestamptz |     |          | ✓        |
| deleted_by  | uuid        |     | users    | ✓        |

```sql
CREATE TABLE messages (
    message_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id   UUID        NOT NULL REFERENCES users    (user_id),
    reply_to_id UUID        REFERENCES messages (message_id),
    content     TEXT        NOT NULL DEFAULT '',
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at   TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ,
    deleted_by  UUID        REFERENCES users (user_id) ON DELETE SET NULL,

    CONSTRAINT chk_messages_deleted_consistency CHECK (
        (deleted_at IS NULL) = (deleted_by IS NULL)
    )
);

CREATE INDEX idx_messages_sender_id ON messages (sender_id);
CREATE INDEX idx_messages_sent_at   ON messages (sent_at DESC);
```

---

## 32. message_attachments

| Column        | Type         | PK  | FK       | Nullable |
| ------------- | ------------ | --- | -------- | -------- |
| attachment_id | uuid         | ✓   |          |          |
| message_id    | uuid         |     | messages |          |
| url           | text         |     |          |          |
| filename      | varchar(255) |     |          | ✓        |
| position      | smallint     |     |          |          |
| created_at    | timestamptz  |     |          |          |

```sql
CREATE TABLE message_attachments (
    attachment_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id    UUID         NOT NULL REFERENCES messages (message_id) ON DELETE CASCADE,
    url           TEXT         NOT NULL,
    filename      VARCHAR(255),
    position      SMALLINT     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_attachments_message_id ON message_attachments (message_id);
```

---

## 33. channel_messages

| Column     | Type | PK  | FK       | Nullable |
| ---------- | ---- | --- | -------- | -------- |
| message_id | uuid | ✓   | messages |          |
| channel_id | uuid |     | channels |          |

```sql
CREATE TABLE channel_messages (
    message_id UUID NOT NULL REFERENCES messages (message_id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels (channel_id),

    PRIMARY KEY (message_id)
);

CREATE INDEX idx_channel_messages_channel_id ON channel_messages (channel_id);
```

---

## 34. conversations

| Column          | Type        | PK  | FK    | Nullable |
| --------------- | ----------- | --- | ----- | -------- |
| conversation_id | uuid        | ✓   |       |          |
| created_by      | uuid        |     | users |          |
| created_at      | timestamptz |     |       |          |

```sql
CREATE TABLE conversations (
    conversation_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by      UUID        NOT NULL REFERENCES users (user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 35. conversation_members

| Column          | Type        | PK  | FK            | Nullable |
| --------------- | ----------- | --- | ------------- | -------- |
| conversation_id | uuid        | ✓   | conversations |          |
| user_id         | uuid        | ✓   | users         |          |
| joined_at       | timestamptz |     |               |          |
| left_at         | timestamptz |     |               | ✓        |

```sql
CREATE TABLE conversation_members (
    conversation_id UUID        NOT NULL REFERENCES conversations (conversation_id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users         (user_id)         ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at         TIMESTAMPTZ,

    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_user_id ON conversation_members (user_id);
```

---

## 36. direct_messages

| Column          | Type | PK  | FK            | Nullable |
| --------------- | ---- | --- | ------------- | -------- |
| message_id      | uuid | ✓   | messages      |          |
| conversation_id | uuid |     | conversations |          |

```sql
CREATE TABLE direct_messages (
    message_id      UUID NOT NULL REFERENCES messages      (message_id)      ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations (conversation_id),

    PRIMARY KEY (message_id)
);

CREATE INDEX idx_direct_messages_conversation_id ON direct_messages (conversation_id);
```

---

## 37. message_reactions

| Column     | Type        | PK  | FK       | Nullable |
| ---------- | ----------- | --- | -------- | -------- |
| user_id    | uuid        | ✓   | users    |          |
| message_id | uuid        | ✓   | messages |          |
| symbol     | text        | ✓   |          |          |
| created_at | timestamptz |     |          |          |

```sql
CREATE TABLE message_reactions (
    user_id    UUID        NOT NULL REFERENCES users    (user_id)    ON DELETE CASCADE,
    message_id UUID        NOT NULL REFERENCES messages (message_id) ON DELETE CASCADE,
    symbol     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, message_id, symbol),
    CONSTRAINT chk_message_reaction_symbol_length CHECK (char_length(symbol) <= 8)
);

CREATE INDEX idx_message_reactions_message_id ON message_reactions (message_id);
```

---

## 38. posts

| Column     | Type        | PK  | FK    | Nullable |
| ---------- | ----------- | --- | ----- | -------- |
| post_id    | uuid        | ✓   |       |          |
| user_id    | uuid        |     | users |          |
| content    | text        |     |       |          |
| created_at | timestamptz |     |       |          |
| edited_at  | timestamptz |     |       | ✓        |
| deleted_at | timestamptz |     |       | ✓        |

```sql
CREATE TABLE posts (
    post_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (user_id),
    content    TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at  TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_posts_user_id    ON posts (user_id);
CREATE INDEX idx_posts_created_at ON posts (created_at DESC);
```

---

## 39. post_attachments

| Column        | Type         | PK  | FK    | Nullable |
| ------------- | ------------ | --- | ----- | -------- |
| attachment_id | uuid         | ✓   |       |          |
| post_id       | uuid         |     | posts |          |
| url           | text         |     |       |          |
| filename      | varchar(255) |     |       | ✓        |
| position      | smallint     |     |       |          |
| created_at    | timestamptz  |     |       |          |

```sql
CREATE TABLE post_attachments (
    attachment_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id       UUID         NOT NULL REFERENCES posts (post_id) ON DELETE CASCADE,
    url           TEXT         NOT NULL,
    filename      VARCHAR(255),
    position      SMALLINT     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_attachments_post_id ON post_attachments (post_id);
```

---

## 40. post_reactions

| Column     | Type        | PK  | FK    | Nullable |
| ---------- | ----------- | --- | ----- | -------- |
| user_id    | uuid        | ✓   | users |          |
| post_id    | uuid        | ✓   | posts |          |
| symbol     | text        | ✓   |       |          |
| created_at | timestamptz |     |       |          |

```sql
CREATE TABLE post_reactions (
    user_id    UUID        NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    post_id    UUID        NOT NULL REFERENCES posts (post_id) ON DELETE CASCADE,
    symbol     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, post_id, symbol),
    CONSTRAINT chk_post_reaction_symbol_length CHECK (char_length(symbol) <= 8)
);

CREATE INDEX idx_post_reactions_post_id ON post_reactions (post_id);
```

---

## 41. comments

| Column            | Type        | PK  | FK       | Nullable |
| ----------------- | ----------- | --- | -------- | -------- |
| comment_id        | uuid        | ✓   |          |          |
| post_id           | uuid        |     | posts    |          |
| user_id           | uuid        |     | users    |          |
| parent_comment_id | uuid        |     | comments | ✓        |
| content           | text        |     |          |          |
| edited_at         | timestamptz |     |          | ✓        |
| created_at        | timestamptz |     |          |          |
| deleted_at        | timestamptz |     |          | ✓        |

```sql
CREATE TABLE comments (
    comment_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id           UUID        NOT NULL REFERENCES posts    (post_id)    ON DELETE CASCADE,
    user_id           UUID        NOT NULL REFERENCES users    (user_id),
    parent_comment_id UUID        REFERENCES comments (comment_id) ON DELETE CASCADE,
    content           TEXT        NOT NULL DEFAULT '',
    edited_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_comments_post_id           ON comments (post_id);
CREATE INDEX idx_comments_user_id           ON comments (user_id);
CREATE INDEX idx_comments_parent_comment_id ON comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;
```

---

## 42. comment_attachments

| Column        | Type         | PK  | FK       | Nullable |
| ------------- | ------------ | --- | -------- | -------- |
| attachment_id | uuid         | ✓   |          |          |
| comment_id    | uuid         |     | comments |          |
| url           | text         |     |          |          |
| filename      | varchar(255) |     |          | ✓        |
| position      | smallint     |     |          |          |
| created_at    | timestamptz  |     |          |          |

```sql
CREATE TABLE comment_attachments (
    attachment_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id    UUID         NOT NULL REFERENCES comments (comment_id) ON DELETE CASCADE,
    url           TEXT         NOT NULL,
    filename      VARCHAR(255),
    position      SMALLINT     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comment_attachments_comment_id ON comment_attachments (comment_id);
```

---

## 43. comment_reactions

| Column     | Type        | PK  | FK       | Nullable |
| ---------- | ----------- | --- | -------- | -------- |
| user_id    | uuid        | ✓   | users    |          |
| comment_id | uuid        | ✓   | comments |          |
| symbol     | text        | ✓   |          |          |
| created_at | timestamptz |     |          |          |

```sql
CREATE TABLE comment_reactions (
    user_id    UUID        NOT NULL REFERENCES users    (user_id)    ON DELETE CASCADE,
    comment_id UUID        NOT NULL REFERENCES comments (comment_id) ON DELETE CASCADE,
    symbol     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, comment_id, symbol),
    CONSTRAINT chk_comment_reaction_symbol_length CHECK (char_length(symbol) <= 8)
);

CREATE INDEX idx_comment_reactions_comment_id ON comment_reactions (comment_id);
```

---

## 44. badges

| Column      | Type           | PK  | FK  | Nullable |
| ----------- | -------------- | --- | --- | -------- |
| badge_id    | uuid           | ✓   |     |          |
| name        | varchar(100)   |     |     |          |
| description | text           |     |     |          |
| category    | badge_category |     |     |          |
| icon_url    | text           |     |     |          |
| created_at  | timestamptz    |     |     |          |
| updated_at  | timestamptz    |     |     |          |

```sql
CREATE TYPE badge_category AS ENUM ('participation', 'achievement', 'social', 'special');

CREATE TABLE badges (
    badge_id    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100)   NOT NULL,
    description TEXT           NOT NULL,
    category    badge_category NOT NULL,
    icon_url    TEXT           NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_badges_name UNIQUE (name)
);
```

---

## 45. user_badges

| Column     | Type        | PK  | FK      | Nullable |
| ---------- | ----------- | --- | ------- | -------- |
| user_id    | uuid        | ✓   | members |          |
| badge_id   | uuid        | ✓   | badges  |          |
| awarded_at | timestamptz |     |         |          |

```sql
CREATE TABLE user_badges (
    user_id    UUID        NOT NULL REFERENCES members (user_id)  ON DELETE CASCADE,
    badge_id   UUID        NOT NULL REFERENCES badges  (badge_id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX idx_user_badges_badge_id ON user_badges (badge_id);
```

---

## 46. games

| Column              | Type         | PK  | FK  | Nullable |
| ------------------- | ------------ | --- | --- | -------- |
| game_id             | uuid         | ✓   |     |          |
| slug                | varchar(50)  |     |     |          |
| name                | varchar(100) |     |     |          |
| description         | text         |     |     | ✓        |
| thumbnail_url       | text         |     |     | ✓        |
| is_active           | boolean      |     |     |          |
| base_daily_plays    | smallint     |     |     |          |
| premium_daily_plays | smallint     |     |     |          |
| max_points_per_play | integer      |     |     | ✓        |
| created_at          | timestamptz  |     |     |          |
| updated_at          | timestamptz  |     |     |          |

```sql
CREATE TABLE games (
    game_id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                VARCHAR(50)  NOT NULL,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    thumbnail_url       TEXT,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    base_daily_plays    SMALLINT     NOT NULL DEFAULT 1,
    premium_daily_plays SMALLINT     NOT NULL DEFAULT 3,
    max_points_per_play INTEGER,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_games_slug UNIQUE (slug),
    CONSTRAINT uq_games_name UNIQUE (name),

    CONSTRAINT chk_games_base_daily_plays    CHECK (base_daily_plays >= 1),
    CONSTRAINT chk_games_premium_daily_plays CHECK (premium_daily_plays >= base_daily_plays),
    CONSTRAINT chk_games_max_points          CHECK (max_points_per_play IS NULL OR max_points_per_play > 0)
);

CREATE INDEX idx_games_active ON games (is_active) WHERE is_active;
```

> `base_daily_plays` is the free attempt allowance per Member per day; Premium
> members get `premium_daily_plays` instead (F-20 / F-21). At least one game
> should have `is_active = TRUE` and be available to all Members.

---

## 47. game_plays

| Column         | Type        | PK  | FK      | Nullable |
| -------------- | ----------- | --- | ------- | -------- |
| play_id        | uuid        | ✓   |         |          |
| game_id        | uuid        |     | games   |          |
| user_id        | uuid        |     | members |          |
| score          | integer     |     |         |          |
| points_awarded | integer     |     |         |          |
| played_at      | timestamptz |     |         |          |

```sql
CREATE TABLE game_plays (
    play_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id        UUID        NOT NULL REFERENCES games   (game_id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    score          INTEGER     NOT NULL DEFAULT 0,
    points_awarded INTEGER     NOT NULL DEFAULT 0,
    played_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_game_plays_score          CHECK (score >= 0),
    CONSTRAINT chk_game_plays_points_awarded CHECK (points_awarded >= 0)
);

CREATE INDEX idx_game_plays_user_id       ON game_plays (user_id);
CREATE INDEX idx_game_plays_game_user_day ON game_plays (game_id, user_id, played_at DESC);
CREATE INDEX idx_game_plays_leaderboard   ON game_plays (game_id, score DESC);
```

> Each row is one completed play (a result). `idx_game_plays_game_user_day`
> supports counting a user's plays for the current day to enforce the daily
> limit; `idx_game_plays_leaderboard` backs per-game high-score leaderboards.

---

## 48. point_transactions

| Column         | Type           | PK  | FK      | Nullable |
| -------------- | -------------- | --- | ------- | -------- |
| transaction_id | uuid           | ✓   |         |          |
| user_id        | uuid           |     | members |          |
| type           | point_txn_type |     |         |          |
| delta          | bigint         |     |         |          |
| balance_after  | bigint         |     |         |          |
| reference_id   | uuid           |     |         | ✓        |
| note           | text           |     |         | ✓        |
| created_at     | timestamptz    |     |         |          |

```sql
CREATE TYPE point_txn_type AS ENUM (
    'game_reward',
    'badge_award',
    'hackathon_placement',
    'bounty_placement',
    'merch_purchase',
    'premium_purchase',
    'admin_adjustment'
);

CREATE TABLE point_transactions (
    transaction_id UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID           NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    type           point_txn_type NOT NULL,
    delta          BIGINT         NOT NULL,
    balance_after  BIGINT         NOT NULL,
    reference_id   UUID,
    note           TEXT,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_point_transactions_delta         CHECK (delta <> 0),
    CONSTRAINT chk_point_transactions_balance_after CHECK (balance_after >= 0)
);

CREATE INDEX idx_point_transactions_user_id ON point_transactions (user_id, created_at DESC);
```

> Append-only ledger of every point change (F-19 awards, F-21 spends). `delta` is
> signed (`+` earn / `-` spend), `balance_after` is the running balance, and
> `members.points` is the cached copy of the latest `balance_after`. `reference_id`
> is a soft pointer to the source row (the table is implied by `type`: e.g.
> `game_reward` → `game_plays`, `merch_purchase` → `merch_orders`); it is
> intentionally not a hard FK because it spans multiple tables.

---

## 49. cosmetic_items

| Column      | Type            | PK  | FK  | Nullable |
| ----------- | --------------- | --- | --- | -------- |
| cosmetic_id | uuid            | ✓   |     |          |
| type        | cosmetic_type   |     |     |          |
| name        | varchar(100)    |     |     |          |
| description | text            |     |     | ✓        |
| rarity      | cosmetic_rarity |     |     |          |
| render_data | jsonb           |     |     |          |
| point_cost  | integer         |     |     | ✓        |
| created_at  | timestamptz     |     |     |          |

```sql
CREATE TYPE cosmetic_type   AS ENUM ('username_effect', 'avatar_decoration', 'banner_effect');
CREATE TYPE cosmetic_rarity AS ENUM ('common', 'rare', 'epic', 'legendary');

CREATE TABLE cosmetic_items (
    cosmetic_id     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    type            cosmetic_type   NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    description     TEXT,
    rarity          cosmetic_rarity NOT NULL DEFAULT 'common',
    render_data     JSONB           NOT NULL,
    point_cost      INTEGER,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_cosmetic_items_name  UNIQUE (name),
    CONSTRAINT chk_cosmetic_point_cost CHECK (point_cost IS NULL OR point_cost > 0)
);
```

---

## 50. user_cosmetics

| Column      | Type        | PK  | FK             | Nullable |
| ----------- | ----------- | --- | -------------- | -------- |
| user_id     | uuid        | ✓   | members        |          |
| cosmetic_id | uuid        | ✓   | cosmetic_items |          |
| obtained_at | timestamptz |     |                |          |
| source      | varchar(50) |     |                |          |

```sql
CREATE TABLE user_cosmetics (
    user_id     UUID        NOT NULL REFERENCES members        (user_id)     ON DELETE CASCADE,
    cosmetic_id UUID        NOT NULL REFERENCES cosmetic_items (cosmetic_id) ON DELETE CASCADE,
    obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source      VARCHAR(50) NOT NULL,

    PRIMARY KEY (user_id, cosmetic_id)
);

CREATE INDEX idx_user_cosmetics_cosmetic_id ON user_cosmetics (cosmetic_id);
```

---

## 51. user_equipped_cosmetics

| Column      | Type          | PK  | FK             | Nullable |
| ----------- | ------------- | --- | -------------- | -------- |
| user_id     | uuid          | ✓   | members        |          |
| slot        | cosmetic_type | ✓   |                |          |
| cosmetic_id | uuid          |     | cosmetic_items |          |

```sql
CREATE TABLE user_equipped_cosmetics (
    user_id     UUID          NOT NULL REFERENCES members        (user_id)     ON DELETE CASCADE,
    slot        cosmetic_type NOT NULL,
    cosmetic_id UUID          NOT NULL REFERENCES cosmetic_items (cosmetic_id),

    PRIMARY KEY (user_id, slot),

    CONSTRAINT fk_equipped_must_be_owned
        FOREIGN KEY (user_id, cosmetic_id)
        REFERENCES user_cosmetics (user_id, cosmetic_id)
);

CREATE INDEX idx_user_equipped_cosmetics_cosmetic_id ON user_equipped_cosmetics (cosmetic_id);
```

---

## 52. merch_items

| Column       | Type         | PK  | FK  | Nullable |
| ------------ | ------------ | --- | --- | -------- |
| merch_id     | uuid         | ✓   |     |          |
| name         | varchar(200) |     |     |          |
| description  | text         |     |     | ✓        |
| image_url    | text         |     |     | ✓        |
| point_cost   | integer      |     |     |          |
| is_available | boolean      |     |     |          |
| created_at   | timestamptz  |     |     |          |
| updated_at   | timestamptz  |     |     |          |

```sql
CREATE TABLE merch_items (
    merch_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(200) NOT NULL,
    description  TEXT,
    image_url    TEXT,
    point_cost   INTEGER      NOT NULL,
    is_available BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_merch_items_name  UNIQUE (name),
    CONSTRAINT chk_merch_point_cost CHECK  (point_cost > 0)
);
```

---

## 53. merch_variants

| Column     | Type         | PK  | FK          | Nullable |
| ---------- | ------------ | --- | ----------- | -------- |
| variant_id | uuid         | ✓   |             |          |
| merch_id   | uuid         |     | merch_items |          |
| label      | varchar(100) |     |             |          |
| stock      | integer      |     |             |          |

```sql
CREATE TABLE merch_variants (
    variant_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    merch_id   UUID         NOT NULL REFERENCES merch_items (merch_id) ON DELETE CASCADE,
    label      VARCHAR(100) NOT NULL,
    stock      INTEGER      NOT NULL DEFAULT 0,

    CONSTRAINT uq_merch_variants_per_item UNIQUE (merch_id, label),
    CONSTRAINT chk_merch_variant_stock    CHECK  (stock >= 0)
);

CREATE INDEX idx_merch_variants_merch_id ON merch_variants (merch_id);
```

---

## 54. merch_orders

| Column           | Type               | PK  | FK      | Nullable |
| ---------------- | ------------------ | --- | ------- | -------- |
| order_id         | uuid               | ✓   |         |          |
| user_id          | uuid               |     | members |          |
| points_spent     | integer            |     |         |          |
| status           | merch_order_status |     |         |          |
| shipping_name    | varchar(200)       |     |         |          |
| shipping_address | text               |     |         |          |
| shipping_city    | varchar(100)       |     |         |          |
| shipping_country | char(2)            |     |         |          |
| shipping_zip     | varchar(20)        |     |         |          |
| tracking_number  | varchar(100)       |     |         | ✓        |
| created_at       | timestamptz        |     |         |          |
| updated_at       | timestamptz        |     |         |          |

```sql
CREATE TYPE merch_order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE merch_orders (
    order_id         UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID               NOT NULL REFERENCES members (user_id) ON DELETE RESTRICT,
    points_spent     INTEGER            NOT NULL,
    status           merch_order_status NOT NULL DEFAULT 'pending',
    shipping_name    VARCHAR(200)       NOT NULL,
    shipping_address TEXT               NOT NULL,
    shipping_city    VARCHAR(100)       NOT NULL,
    shipping_country CHAR(2)            NOT NULL,
    shipping_zip     VARCHAR(20)        NOT NULL,
    tracking_number  VARCHAR(100),
    created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_merch_orders_points CHECK (points_spent > 0)
);

CREATE INDEX idx_merch_orders_user_id ON merch_orders (user_id);
CREATE INDEX idx_merch_orders_status  ON merch_orders (status);
```

---

## 55. merch_order_items

| Column        | Type     | PK  | FK             | Nullable |
| ------------- | -------- | --- | -------------- | -------- |
| order_item_id | uuid     | ✓   |                |          |
| order_id      | uuid     |     | merch_orders   |          |
| merch_id      | uuid     |     | merch_items    |          |
| variant_id    | uuid     |     | merch_variants | ✓        |
| quantity      | smallint |     |                |          |
| point_cost    | integer  |     |                |          |

```sql
CREATE TABLE merch_order_items (
    order_item_id UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID     NOT NULL REFERENCES merch_orders   (order_id)   ON DELETE CASCADE,
    merch_id      UUID     NOT NULL REFERENCES merch_items    (merch_id),
    variant_id    UUID     REFERENCES merch_variants (variant_id),
    quantity      SMALLINT NOT NULL DEFAULT 1,
    point_cost    INTEGER  NOT NULL,

    CONSTRAINT chk_merch_order_items_quantity   CHECK (quantity > 0),
    CONSTRAINT chk_merch_order_items_point_cost CHECK (point_cost > 0)
);

CREATE INDEX idx_merch_order_items_order_id ON merch_order_items (order_id);
```

---

## 56. subscriptions

| Column          | Type                | PK  | FK      | Nullable |
| --------------- | ------------------- | --- | ------- | -------- |
| subscription_id | uuid                | ✓   |         |          |
| user_id         | uuid                |     | members |          |
| plan            | subscription_plan   |     |         |          |
| status          | subscription_status |     |         |          |
| started_at      | timestamptz         |     |         |          |
| ends_at         | timestamptz         |     |         |          |
| cancelled_at    | timestamptz         |     |         | ✓        |

```sql
CREATE TYPE subscription_plan   AS ENUM ('premium');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired');

CREATE TABLE subscriptions (
    subscription_id UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID                NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    plan            subscription_plan   NOT NULL DEFAULT 'premium',
    status          subscription_status NOT NULL DEFAULT 'active',
    started_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    ends_at         TIMESTAMPTZ         NOT NULL,
    cancelled_at    TIMESTAMPTZ,

    CONSTRAINT chk_subscriptions_dates CHECK (started_at < ends_at),
    CONSTRAINT chk_subscriptions_cancelled_consistency CHECK (
        cancelled_at IS NULL OR status = 'cancelled'
    )
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_active  ON subscriptions (user_id, status) WHERE status = 'active';
```

---

## 57. subscription_payments

| Column              | Type        | PK  | FK            | Nullable |
| ------------------- | ----------- | --- | ------------- | -------- |
| payment_id          | uuid        | ✓   |               |          |
| subscription_id     | uuid        |     | subscriptions |          |
| amount_cents        | integer     |     |               |          |
| currency            | char(3)     |     |               |          |
| payment_provider    | varchar(50) |     |               |          |
| provider_payment_id | text        |     |               |          |
| paid_at             | timestamptz |     |               |          |

```sql
CREATE TABLE subscription_payments (
    payment_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id     UUID        NOT NULL REFERENCES subscriptions (subscription_id),
    amount_cents        INTEGER     NOT NULL,
    currency            CHAR(3)     NOT NULL DEFAULT 'EUR',
    payment_provider    VARCHAR(50) NOT NULL,
    provider_payment_id TEXT        NOT NULL,
    paid_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_subscription_payments_provider_id UNIQUE (payment_provider, provider_payment_id),
    CONSTRAINT chk_subscription_payments_amount     CHECK  (amount_cents > 0)
);

CREATE INDEX idx_subscription_payments_subscription_id ON subscription_payments (subscription_id);
```

---

## 58. reports

| Column          | Type               | PK  | FK             | Nullable |
| --------------- | ------------------ | --- | -------------- | -------- |
| report_id       | uuid               | ✓   |                |          |
| reporter_id     | uuid               |     | users          |          |
| target_type     | report_target_type |     |                |          |
| target_id       | uuid               |     |                |          |
| reason          | text               |     |                |          |
| status          | report_status      |     |                |          |
| reviewed_by     | uuid               |     | administrators | ✓        |
| reviewed_at     | timestamptz        |     |                | ✓        |
| resolution_note | text               |     |                | ✓        |
| created_at      | timestamptz        |     |                |          |

```sql
CREATE TYPE report_target_type AS ENUM ('user', 'post', 'comment', 'message', 'hackathon');
CREATE TYPE report_status      AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');

CREATE TABLE reports (
    report_id       UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     UUID               NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    target_type     report_target_type NOT NULL,
    target_id       UUID               NOT NULL,
    reason          TEXT               NOT NULL,
    status          report_status      NOT NULL DEFAULT 'pending',
    reviewed_by     UUID               REFERENCES administrators (user_id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    resolution_note TEXT,
    created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_reports_reporter_target UNIQUE (reporter_id, target_type, target_id),

    CONSTRAINT chk_reports_review_consistency CHECK (
        (reviewed_at IS NULL) = (reviewed_by IS NULL)
    ),
    CONSTRAINT chk_reports_resolution_note CHECK (
        resolution_note IS NULL OR status IN ('resolved', 'dismissed')
    )
);

CREATE INDEX idx_reports_status      ON reports (status);
CREATE INDEX idx_reports_reporter_id ON reports (reporter_id);
CREATE INDEX idx_reports_target      ON reports (target_type, target_id);
```

---

## 59. notifications

| Column          | Type              | PK  | FK    | Nullable |
| --------------- | ----------------- | --- | ----- | -------- |
| notification_id | uuid              | ✓   |       |          |
| user_id         | uuid              |     | users |          |
| type            | notification_type |     |       |          |
| title           | varchar(100)      |     |       |          |
| body            | text              |     |       | ✓        |
| entity_type     | entity_type       |     |       | ✓        |
| entity_id       | uuid              |     |       | ✓        |
| read_at         | timestamptz       |     |       | ✓        |
| created_at      | timestamptz       |     |       |          |

```sql
CREATE TYPE entity_type AS ENUM (
    'user', 'hackathon', 'application', 'team',
    'project', 'post', 'comment', 'badge', 'message', 'bounty', 'game'
);

CREATE TYPE notification_type AS ENUM (
    'application_approved',
    'application_rejected',
    'application_waitlisted',
    'badge_awarded',
    'hackathon_result_posted',
    'hackathon_starting_soon',
    'organization_verified',
    'organization_rejected',
    'new_direct_message',
    'position_assigned',
    'bounty_result_posted',
    'merch_order_shipped',
    'new_follower',
    'friend_request_received',
    'friend_request_accepted',
    'team_invitation_received',
    'team_request_received',
    'team_request_accepted',
    'post_comment',
    'post_reaction'
);

CREATE TABLE notifications (
    notification_id UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID              NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    type            notification_type NOT NULL,
    title           VARCHAR(100)      NOT NULL,
    body            TEXT,
    entity_type     entity_type,
    entity_id       UUID,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_notifications_entity_consistency CHECK (
        (entity_type IS NULL) = (entity_id IS NULL)
    )
);

CREATE INDEX idx_notifications_user_id ON notifications (user_id);
CREATE INDEX idx_notifications_unread  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
```

---

## 60. application_questions

Custom questions an organizer attaches to a hackathon's application form. `type` drives the input widget; `options` holds the choices for `single_choice` / `multi_choice` types.

| Column       | Type        | PK  | FK         | Nullable |
| ------------ | ----------- | --- | ---------- | -------- |
| question_id  | uuid        | ✓   |            |          |
| hackathon_id | uuid        |     | hackathons |          |
| prompt       | text        |     |            |          |
| type         | varchar(20) |     |            |          |
| options      | jsonb       |     |            | ✓        |
| required     | boolean     |     |            |          |
| position     | integer     |     |            |          |
| created_at   | timestamptz |     |            |          |

```sql
CREATE TABLE application_questions (
    question_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID        NOT NULL REFERENCES hackathons (hackathon_id) ON DELETE CASCADE,
    prompt       TEXT        NOT NULL,
    type         VARCHAR(20) NOT NULL DEFAULT 'short_text',
    options      JSONB,
    required     BOOLEAN     NOT NULL DEFAULT FALSE,
    position     INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_application_questions_type CHECK (
        type IN ('short_text', 'long_text', 'single_choice', 'multi_choice')
    ),
    CONSTRAINT chk_application_questions_options CHECK (
        type IN ('short_text', 'long_text') OR options IS NOT NULL
    )
);

CREATE INDEX idx_application_questions_hackathon_id ON application_questions (hackathon_id);
```

---

## 61. question_answers

An applicant's answer to a single application question. For choice questions the selected option(s) are stored as text / JSON-encoded text. One answer per (application, question).

| Column         | Type        | PK  | FK                    | Nullable |
| -------------- | ----------- | --- | --------------------- | -------- |
| answer_id      | uuid        | ✓   |                       |          |
| application_id | uuid        |     | applications          |          |
| question_id    | uuid        |     | application_questions |          |
| answer         | text        |     |                       |          |
| created_at     | timestamptz |     |                       |          |

```sql
CREATE TABLE question_answers (
    answer_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID        NOT NULL REFERENCES applications          (application_id) ON DELETE CASCADE,
    question_id    UUID        NOT NULL REFERENCES application_questions (question_id)    ON DELETE CASCADE,
    answer         TEXT        NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_question_answers_application_question ON question_answers (application_id, question_id);
CREATE INDEX        idx_question_answers_application_id      ON question_answers (application_id);
CREATE INDEX        idx_question_answers_question_id         ON question_answers (question_id);
```

---

## 62. team_join_requests

A member's request to join an open team; the team leader accepts or declines. At most one pending request per (team, user).

| Column       | Type        | PK  | FK      | Nullable |
| ------------ | ----------- | --- | ------- | -------- |
| request_id   | uuid        | ✓   |         |          |
| team_id      | uuid        |     | teams   |          |
| user_id      | uuid        |     | members |          |
| message      | text        |     |         | ✓        |
| status       | varchar(20) |     |         |          |
| created_at   | timestamptz |     |         |          |
| responded_at | timestamptz |     |         | ✓        |
| responded_by | uuid        |     | users   | ✓        |

```sql
CREATE TABLE team_join_requests (
    request_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id      UUID        NOT NULL REFERENCES teams   (team_id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    message      TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    responded_by UUID        REFERENCES users (user_id) ON DELETE SET NULL,

    CONSTRAINT chk_team_join_requests_status CHECK (
        status IN ('pending', 'accepted', 'declined')
    )
);

CREATE UNIQUE INDEX uq_team_join_requests_pending ON team_join_requests (team_id, user_id) WHERE status = 'pending';
CREATE INDEX        idx_team_join_requests_team_id ON team_join_requests (team_id);
CREATE INDEX        idx_team_join_requests_user_id ON team_join_requests (user_id);
```

---

## 63. team_invitations

A team leader's invitation to a (solo) member; the invitee accepts or declines. At most one pending invitation per (team, user).

| Column        | Type        | PK  | FK      | Nullable |
| ------------- | ----------- | --- | ------- | -------- |
| invitation_id | uuid        | ✓   |         |          |
| team_id       | uuid        |     | teams   |          |
| user_id       | uuid        |     | members |          |
| invited_by    | uuid        |     | users   | ✓        |
| message       | text        |     |         | ✓        |
| status        | varchar(20) |     |         |          |
| created_at    | timestamptz |     |         |          |
| responded_at  | timestamptz |     |         | ✓        |

```sql
CREATE TABLE team_invitations (
    invitation_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id       UUID        NOT NULL REFERENCES teams   (team_id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES members (user_id) ON DELETE CASCADE,
    invited_by    UUID        REFERENCES users (user_id) ON DELETE SET NULL,
    message       TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at  TIMESTAMPTZ,

    CONSTRAINT chk_team_invitations_status CHECK (
        status IN ('pending', 'accepted', 'declined')
    )
);

CREATE UNIQUE INDEX uq_team_invitations_pending ON team_invitations (team_id, user_id) WHERE status = 'pending';
CREATE INDEX        idx_team_invitations_team_id ON team_invitations (team_id);
CREATE INDEX        idx_team_invitations_user_id ON team_invitations (user_id);
```

---

## Table Creation Order

```
 1.  users
 2.  administrators
 3.  members
 4.  organizations
 5.  user_bans
 6.  follows
 7.  friendships

 8.  skills
 9.  member_skills

10.  hackathons
11.  hackathon_required_skills
12.  bounties
13.  hackathon_prizes
14.  teams
15.  team_members
16.  applications
17.  projects
18.  hackathon_results
19.  bounty_submissions
20.  votes

21.  kanban_boards
22.  kanban_columns
23.  kanban_cards

24.  servers
25.  server_roles
26.  permissions
27.  server_role_permissions
28.  user_roles
29.  channel_groups
30.  channels

31.  messages
32.  message_attachments
33.  channel_messages
34.  conversations
35.  conversation_members
36.  direct_messages
37.  message_reactions

38.  posts
39.  post_attachments
40.  post_reactions
41.  comments
42.  comment_attachments
43.  comment_reactions

44.  badges
45.  user_badges
46.  games
47.  game_plays
48.  point_transactions

49.  cosmetic_items
50.  user_cosmetics
51.  user_equipped_cosmetics

52.  merch_items
53.  merch_variants
54.  merch_orders
55.  merch_order_items

56.  subscriptions
57.  subscription_payments

58.  reports
59.  notifications

60.  application_questions
61.  question_answers

62.  team_join_requests
63.  team_invitations
```
