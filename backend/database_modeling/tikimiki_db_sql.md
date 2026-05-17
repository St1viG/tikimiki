# tikimiki — Database Schema v4.1 (SQL)

---

## ENUMs

```sql
CREATE TYPE org_verification_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE hackathon_type   AS ENUM ('physical', 'virtual', 'hybrid');
CREATE TYPE hackathon_status AS ENUM ('upcoming', 'ongoing', 'finished', 'cancelled');

CREATE TYPE team_role AS ENUM ('leader', 'member');

CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected', 'waitlisted', 'withdrawn');

CREATE TYPE project_status AS ENUM ('draft', 'submitted', 'under_review', 'judged');

CREATE TYPE channel_type AS ENUM ('general', 'announcements', 'team', 'private');

CREATE TYPE badge_category AS ENUM ('participation', 'achievement', 'social', 'special');

CREATE TYPE cosmetic_type   AS ENUM ('username_effect', 'avatar_decoration', 'banner_effect');
CREATE TYPE cosmetic_rarity AS ENUM ('common', 'rare', 'epic', 'legendary');

CREATE TYPE merch_order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TYPE subscription_plan   AS ENUM ('premium');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired');

CREATE TYPE report_target_type AS ENUM ('user', 'post', 'comment', 'message', 'hackathon');
CREATE TYPE report_status      AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');

CREATE TYPE entity_type AS ENUM (
    'user', 'hackathon', 'application', 'team',
    'project', 'post', 'comment', 'badge', 'message', 'bounty'
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
    'merch_order_shipped'
);
```

---

## Tables

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


CREATE TABLE administrators (
    user_id    UUID        PRIMARY KEY REFERENCES users          (user_id) ON DELETE CASCADE,
    granted_by UUID        REFERENCES administrators (user_id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE members (
    user_id UUID   PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
    points  BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT chk_members_points_non_negative CHECK (points >= 0)
);

CREATE INDEX idx_members_points ON members (points DESC);


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


CREATE TABLE skills (
    skill_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name     VARCHAR(100) NOT NULL,
    category VARCHAR(50),

    CONSTRAINT uq_skills_name UNIQUE (name)
);


CREATE TABLE member_skills (
    user_id  UUID NOT NULL REFERENCES members (user_id)  ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills  (skill_id) ON DELETE CASCADE,

    PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX idx_member_skills_skill_id ON member_skills (skill_id);


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


CREATE TABLE hackathon_required_skills (
    hackathon_id UUID NOT NULL REFERENCES hackathons (hackathon_id) ON DELETE CASCADE,
    skill_id     UUID NOT NULL REFERENCES skills     (skill_id)     ON DELETE CASCADE,

    PRIMARY KEY (hackathon_id, skill_id)
);

CREATE INDEX idx_hackathon_required_skills_skill_id ON hackathon_required_skills (skill_id);


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


CREATE TABLE teams (
    team_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID         NOT NULL REFERENCES hackathons (hackathon_id),
    name         VARCHAR(100) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ,

);

CREATE UNIQUE INDEX uq_teams_name_per_hackathon ON teams (hackathon_id, name) WHERE deleted_at IS NULL;
CREATE INDEX        idx_teams_hackathon_id ON teams (hackathon_id);


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


CREATE TABLE bounty_submissions (
    bounty_id    UUID        NOT NULL REFERENCES bounties (bounty_id)  ON DELETE CASCADE,
    project_id   UUID        NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,

    PRIMARY KEY (bounty_id, project_id)
);

CREATE INDEX idx_bounty_submissions_project_id ON bounty_submissions (project_id);


CREATE TABLE kanban_boards (
    board_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id    UUID        NOT NULL REFERENCES teams (team_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_kanban_boards_team UNIQUE (team_id)
);


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


CREATE TABLE server_roles (
    server_role_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id      UUID         NOT NULL REFERENCES servers (server_id) ON DELETE CASCADE,
    name           VARCHAR(100) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_server_roles_name_per_server UNIQUE (server_id, name)
);

CREATE INDEX idx_server_roles_server_id ON server_roles (server_id);


CREATE TABLE permissions (
    permission_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    description   TEXT         NOT NULL,

    CONSTRAINT uq_permissions_name UNIQUE (name)
);


CREATE TABLE server_role_permissions (
    server_role_id UUID NOT NULL REFERENCES server_roles (server_role_id) ON DELETE CASCADE,
    permission_id  UUID NOT NULL REFERENCES permissions  (permission_id)  ON DELETE CASCADE,

    PRIMARY KEY (server_role_id, permission_id)
);

CREATE INDEX idx_server_role_permissions_permission_id ON server_role_permissions (permission_id);


CREATE TABLE user_roles (
    server_role_id UUID        NOT NULL REFERENCES server_roles (server_role_id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES members       (user_id)        ON DELETE CASCADE,
    assigned_by    UUID        REFERENCES users (user_id) ON DELETE SET NULL,
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (server_role_id, user_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);


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


CREATE TABLE channels (
    channel_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID         NOT NULL REFERENCES channel_groups (group_id) ON DELETE CASCADE,
    team_id    UUID         REFERENCES teams (team_id),
    type       channel_type NOT NULL,
    name       VARCHAR(100) NOT NULL,
    position   REAL         NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT uq_channels_name_per_group    UNIQUE (group_id, name),
    CONSTRAINT chk_channels_team_consistency CHECK (
        (type = 'team') = (team_id IS NOT NULL)
    ),
    CONSTRAINT chk_channels_position         CHECK (position >= 0.0)
);

CREATE UNIQUE INDEX uq_channels_active_position_per_group ON channels (group_id, position) WHERE deleted_at IS NULL;
CREATE INDEX        idx_channels_group_id                  ON channels (group_id);


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


CREATE TABLE message_attachments (
    attachment_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id    UUID         NOT NULL REFERENCES messages (message_id) ON DELETE CASCADE,
    url           TEXT         NOT NULL,
    filename      VARCHAR(255),
    position      SMALLINT     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_attachments_message_id ON message_attachments (message_id);


CREATE TABLE channel_messages (
    message_id UUID NOT NULL REFERENCES messages (message_id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES channels (channel_id),

    PRIMARY KEY (message_id)
);

CREATE INDEX idx_channel_messages_channel_id ON channel_messages (channel_id);


CREATE TABLE conversations (
    conversation_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by      UUID        NOT NULL REFERENCES users (user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE conversation_members (
    conversation_id UUID        NOT NULL REFERENCES conversations (conversation_id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users         (user_id)         ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at         TIMESTAMPTZ,

    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_members_user_id ON conversation_members (user_id);


CREATE TABLE direct_messages (
    message_id      UUID NOT NULL REFERENCES messages      (message_id)      ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations (conversation_id),

    PRIMARY KEY (message_id)
);

CREATE INDEX idx_direct_messages_conversation_id ON direct_messages (conversation_id);


CREATE TABLE message_reactions (
    user_id    UUID        NOT NULL REFERENCES users    (user_id)    ON DELETE CASCADE,
    message_id UUID        NOT NULL REFERENCES messages (message_id) ON DELETE CASCADE,
    symbol     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, message_id, symbol),
    CONSTRAINT chk_message_reaction_symbol_length CHECK (char_length(symbol) <= 8)
);

CREATE INDEX idx_message_reactions_message_id ON message_reactions (message_id);


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


CREATE TABLE post_attachments (
    attachment_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id       UUID         NOT NULL REFERENCES posts (post_id) ON DELETE CASCADE,
    url           TEXT         NOT NULL,
    filename      VARCHAR(255),
    position      SMALLINT     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_post_attachments_post_id ON post_attachments (post_id);


CREATE TABLE post_reactions (
    user_id    UUID        NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    post_id    UUID        NOT NULL REFERENCES posts (post_id) ON DELETE CASCADE,
    symbol     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, post_id, symbol),
    CONSTRAINT chk_post_reaction_symbol_length CHECK (char_length(symbol) <= 8)
);

CREATE INDEX idx_post_reactions_post_id ON post_reactions (post_id);


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


CREATE TABLE comment_attachments (
    attachment_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id    UUID         NOT NULL REFERENCES comments (comment_id) ON DELETE CASCADE,
    url           TEXT         NOT NULL,
    filename      VARCHAR(255),
    position      SMALLINT     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comment_attachments_comment_id ON comment_attachments (comment_id);


CREATE TABLE comment_reactions (
    user_id    UUID        NOT NULL REFERENCES users    (user_id)    ON DELETE CASCADE,
    comment_id UUID        NOT NULL REFERENCES comments (comment_id) ON DELETE CASCADE,
    symbol     TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, comment_id, symbol),
    CONSTRAINT chk_comment_reaction_symbol_length CHECK (char_length(symbol) <= 8)
);

CREATE INDEX idx_comment_reactions_comment_id ON comment_reactions (comment_id);


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


CREATE TABLE user_badges (
    user_id    UUID        NOT NULL REFERENCES members (user_id)  ON DELETE CASCADE,
    badge_id   UUID        NOT NULL REFERENCES badges  (badge_id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX idx_user_badges_badge_id ON user_badges (badge_id);


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


CREATE TABLE user_cosmetics (
    user_id     UUID        NOT NULL REFERENCES members        (user_id)     ON DELETE CASCADE,
    cosmetic_id UUID        NOT NULL REFERENCES cosmetic_items (cosmetic_id) ON DELETE CASCADE,
    obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source      VARCHAR(50) NOT NULL,

    PRIMARY KEY (user_id, cosmetic_id)
);

CREATE INDEX idx_user_cosmetics_cosmetic_id ON user_cosmetics (cosmetic_id);


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


CREATE TABLE merch_variants (
    variant_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    merch_id   UUID         NOT NULL REFERENCES merch_items (merch_id) ON DELETE CASCADE,
    label      VARCHAR(100) NOT NULL,
    stock      INTEGER      NOT NULL DEFAULT 0,

    CONSTRAINT uq_merch_variants_per_item UNIQUE (merch_id, label),
    CONSTRAINT chk_merch_variant_stock    CHECK  (stock >= 0)
);

CREATE INDEX idx_merch_variants_merch_id ON merch_variants (merch_id);


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
