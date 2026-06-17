"use client";

import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { OrbArt } from "@/components/ui/OrbArt";
import { personName } from "@/lib/displayName";
import type { Permission } from "@/lib/api";
import { M } from "./strings";
import {
  personSeed,
  VOTE_EL_KEYS,
  TEAM_OPTIONS,
  type ChatMsg,
  type DmEntry,
  type TeamKey,
} from "./shared";

/* Presentational sub-components for the Cohor client (extracted from
   CohorClient.tsx). Stateless except for their own local UI state. */

export function RoleEditor({
  t,
  permCatalog,
  name,
  perms,
  onName,
  onTogglePerm,
  onSave,
  onCancel,
  saveLabel,
}: {
  t: (k: keyof typeof M) => string;
  permCatalog: Permission[];
  name: string;
  perms: Set<string>;
  onName: (v: string) => void;
  onTogglePerm: (p: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="srv-role-editor">
      <div className="grp-field">
        <label className="grp-label">{t("srvRoleNameLabel")}</label>
        <input
          className="grp-input"
          type="text"
          value={name}
          maxLength={60}
          placeholder={t("srvRoleNamePh")}
          autoFocus
          onChange={(e) => onName(e.target.value)}
        />
      </div>
      <div className="grp-field">
        <span className="grp-label">{t("srvRolePerms")}</span>
        <div className="srv-perm-list">
          {permCatalog.map((p) => (
            <label className="srv-perm-row" key={p.permissionId}>
              <input
                type="checkbox"
                className="grp-check"
                checked={perms.has(p.name)}
                onChange={() => onTogglePerm(p.name)}
              />
              <span className="srv-perm-text">
                <span className="srv-perm-name">{p.name}</span>
                <span className="srv-perm-desc">{p.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grp-modal-actions">
        <button type="button" className="grp-btn grp-btn-ghost" onClick={onCancel}>
          {t("srvRoleCancel")}
        </button>
        <button
          type="button"
          className="grp-btn grp-btn-primary"
          disabled={!name.trim()}
          onClick={onSave}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

/* Shared user strip (bottom of both sidebars) — the current logged-in user. */
export function UserStrip({
  onOpenProfile,
  onContextMenu,
}: {
  onOpenProfile?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
}) {
  const t = useT(M);
  const { user, logout } = useAuth();
  const router = useRouter();
  const name = user?.username ?? "guest";
  const clickable = onOpenProfile
    ? { cursor: "pointer" as const, onClick: onOpenProfile }
    : {};
  return (
    <div className="user-strip" onContextMenu={onContextMenu}>
      <div className="avatar avatar-strip is-orb" {...clickable}>
        <OrbArt url={user?.avatarUrl} seed={name} />
      </div>
      <div className="user-strip-info" {...clickable}>
        <div className="user-strip-name">{user ? personName(user) : name}</div>
        <div className="user-strip-status">
          <span className="status-dot"></span>@{name} · {t("online")}
        </div>
      </div>
      <div className="strip-actions">
        <Link className="strip-btn" href="/settings" aria-label={t("settings")}>
          <Icon name="settings" className="ic-sm" />
        </Link>
        <button
          className="strip-btn"
          type="button"
          aria-label={t("logout")}
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <Icon name="logout" className="ic-sm" />
        </button>
      </div>
    </div>
  );
}

/* A runtime (sent) message rendered into the server/DM stream. */
export function RuntimeMsg({ m }: { m: ChatMsg }) {
  return (
    <div
      className={"msg" + (m.grouped ? " msg-grouped" : "")}
      style={m.marginTop && !m.grouped ? { marginTop: 10 } : undefined}
    >
      <div className="msg-av is-orb">
        <GenerativeAvatar seed={personSeed(m.name)} className="orb-art" />
      </div>
      <div className="msg-body">
        {!m.grouped && (
          <div className="msg-meta-row">
            <span className={"msg-author " + m.nc}>{m.name}</span>
            <span className="msg-time">{m.t}</span>
          </div>
        )}
        <div className="msg-text">{m.text}</div>
      </div>
    </div>
  );
}

/* DM message stream: intro + seed messages + any sent messages. */
export function DmStream({ entry, extra }: { entry: DmEntry; extra: ChatMsg[] }) {
  const t = useT(M);
  const introAv = entry.group ? (
    <div className="dm-group-av" style={{ width: 52, height: 52 }}>
      <div
        className="ga1 is-orb"
        style={{ width: 28, height: 28 }}
      >
        <GenerativeAvatar seed="andrej" className="orb-art" />
      </div>
      <div
        className="ga2 is-orb"
        style={{ width: 28, height: 28 }}
      >
        <GenerativeAvatar seed="stevangnjato" className="orb-art" />
      </div>
    </div>
  ) : (
    <div
      className="is-orb"
      style={{
        width: 52,
        height: 52,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <GenerativeAvatar
        seed={personSeed(entry.fullName)}
        className="orb-art"
      />
      <span
        style={{
          position: "absolute",
          bottom: 2,
          right: 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "2px solid var(--bg)",
          background: entry.statusBg,
        }}
      ></span>
    </div>
  );

  return (
    <>
      <div style={{ flex: 1 }}></div>
      <div className="dm-conv-intro">
        {introAv}
        <div className="dm-conv-intro-name">{t(entry.fullName as keyof typeof M)}</div>
        <div className="dm-conv-intro-handle">{t(entry.handle as keyof typeof M)}</div>
        <div className="dm-conv-intro-bio">{t(entry.bio as keyof typeof M)}</div>
        <div className="dm-conv-intro-start">
          {t("dmConvStartPre")}
          <strong style={{ color: "var(--violet-light)" }}>{t(entry.fullName as keyof typeof M)}</strong>
          {t("dmConvStartPost")}
        </div>
      </div>
      <div className="msg-date-sep">{t("today")}</div>
      {entry.msgs.map((m, i) => {
        const grp = i > 0 && entry.msgs[i - 1].av === m.av;
        return (
          <div
            key={i}
            className={"msg" + (grp ? " msg-grouped" : "")}
            style={i > 0 && !grp ? { marginTop: 10 } : undefined}
          >
            <div className="msg-av is-orb">
              <GenerativeAvatar seed={personSeed(m.name)} className="orb-art" />
            </div>
            <div className="msg-body">
              {!grp && (
                <div className="msg-meta-row">
                  <span className={"msg-author " + m.nc}>{m.name}</span>
                  <span className="msg-time">{m.t}</span>
                </div>
              )}
              <div className="msg-text">{t(m.text as keyof typeof M)}</div>
              {m.link && (
                <div style={{ marginTop: 6 }}>
                  <div className="msg-attachment">
                    <span className="msg-attachment-icon">
                      <Icon name="link" className="ic-sm" />
                    </span>
                    <div>
                      <div className="msg-attachment-name">{m.link.n}</div>
                      <div className="msg-attachment-sub">{m.link.s}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {extra.map((m) => (
        <RuntimeMsg key={m.id} m={m} />
      ))}
    </>
  );
}

/* DM profile panel (right column in DM mode). */
export function DmProfile({ entry }: { entry: DmEntry }) {
  const t = useT(M);
  const profAv = entry.group ? (
    <div className="dm-group-av" style={{ width: 52, height: 52 }}>
      <div
        className="ga1 is-orb"
        style={{ width: 28, height: 28 }}
      >
        <GenerativeAvatar seed="andrej" className="orb-art" />
      </div>
      <div
        className="ga2 is-orb"
        style={{ width: 28, height: 28 }}
      >
        <GenerativeAvatar seed="stevangnjato" className="orb-art" />
      </div>
    </div>
  ) : (
    <div className="dm-profile-av is-orb">
      <GenerativeAvatar seed={personSeed(entry.fullName)} className="orb-art" />
      <span className="dm-pav-si" style={{ background: entry.statusBg }}></span>
    </div>
  );

  return (
    <>
      <div className="dm-profile-banner"></div>
      <div className="dm-profile-av-wrap">
        {profAv}
        <div className="dm-profile-actions">
          <button type="button" className="dm-profile-act-btn" aria-label={t("dmCall")}>
            <Icon name="bell" className="ic-sm" />
          </button>
          <button type="button" className="dm-profile-act-btn" aria-label={t("dmVideo")}>
            <Icon name="image" className="ic-sm" />
          </button>
          <button type="button" className="dm-profile-act-btn" aria-label={t("dmProfileAria")}>
            <Icon name="teams" className="ic-sm" />
          </button>
        </div>
      </div>
      <div className="dm-profile-body">
        <div className="dm-profile-name">{t(entry.fullName as keyof typeof M)}</div>
        <div className="dm-profile-handle">
          {t(entry.handle as keyof typeof M)} ·{" "}
          <span style={{ color: entry.statusBg }}>
            {t(entry.statusLabel as keyof typeof M)}
          </span>
        </div>
        <div className="dm-profile-card">
          <div className="dm-profile-card-label">{t("dmAboutUser")}</div>
          <div className="dm-profile-card-val">{t(entry.bio as keyof typeof M)}</div>
        </div>
        <div className="dm-profile-card-label dm-profile-card-label-loose">
          {t("dmSharedHackathons")}
        </div>
        {entry.hacks.map((h, i) => (
          <div className="dm-shared-hack" key={i}>
            <div className="dm-shared-hack-icon">{h.icon}</div>
            <div className="dm-shared-hack-info">
              <div className="dm-shared-hack-name">{h.name}</div>
              <div className="dm-shared-hack-sub">{t(h.sub as keyof typeof M)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* A single sponsor bounty card. */
export function BountyCard({
  id,
  cardStyle,
  badgeStyle,
  badgeIcon,
  sponsor,
  prize,
  title,
  desc,
  tags,
  count,
  applied,
  onApply,
}: {
  id: string;
  cardStyle?: CSSProperties;
  badgeStyle: CSSProperties;
  badgeIcon: string;
  sponsor: string;
  prize: string;
  title: string;
  desc: string;
  tags: string[];
  count: number;
  applied: boolean;
  onApply: () => void;
}) {
  const t = useT(M);
  return (
    <div className="bounty-card" id={`bounty-${id}`} style={cardStyle}>
      <div className="bounty-card-header">
        <div className="bounty-sponsor-badge" style={badgeStyle}>
          <Icon name={badgeIcon} className="ic-sm" /> {sponsor}
        </div>
        <div className="bounty-prize-pill">{prize}</div>
      </div>
      <div className="bounty-title">{title}</div>
      <div className="bounty-desc">{desc}</div>
      <div className="bounty-tags">
        {tags.map((t) => (
          <span className="bounty-tag" key={t}>
            {t}
          </span>
        ))}
      </div>
      <div className="bounty-footer">
        <div className="bounty-applicants" id={`bounty-${id}-count`}>
          <Icon name="teams" className="ic-sm" />{" "}
          <span id={`${id}-count-num`}>{count}</span>{t("bountyApplicantsSuffix")}
        </div>
        <button
          className={"bounty-apply-btn" + (applied ? " bounty-apply-btn-done" : "")}
          type="button"
          id={`btn-${id}`}
          onClick={onApply}
        >
          {applied ? t("bountyAppliedBtn") : t("bountyApplyBtn")}
        </button>
      </div>
    </div>
  );
}

/* A single audience-voting project card. */
export function ProjectCard({
  team,
  btnId,
  av,
  avStyle,
  name,
  badge,
  badgeStyle,
  desc,
  tags,
  votesId,
  votes,
  isVotingOpen,
  myVote,
  onVote,
}: {
  team: TeamKey;
  btnId: string;
  av: string;
  avStyle: CSSProperties;
  name: string;
  badge: string;
  badgeStyle: CSSProperties;
  desc: string;
  tags: string[];
  votesId: string;
  votes: number;
  isVotingOpen: boolean;
  myVote: TeamKey | null;
  onVote: (team: TeamKey) => void;
}) {
  const t = useT(M);
  const realTeam = VOTE_EL_KEYS[btnId];
  const voted = myVote === realTeam;
  const spent = myVote !== null && !voted;
  const disabled = !isVotingOpen || myVote !== null;

  let btnClass = "vote-btn";
  if (isVotingOpen && voted) btnClass += " voted";
  else if (isVotingOpen && spent) btnClass += " vote-btn-spent";

  const label = !isVotingOpen
    ? t("voteBtn")
    : voted
    ? t("votedBtn")
    : t("voteBtn");

  return (
    <div className="project-card" data-team={team}>
      <div className="project-card-left">
        <div className="project-av" style={avStyle}>
          {av}
        </div>
        <div className="project-info">
          <div className="project-name">
            {name}{" "}
            <span className="project-team-badge" style={badgeStyle}>
              {badge}
            </span>
          </div>
          <div className="project-desc">{desc}</div>
          <div className="project-tags">
            {tags.map((t) => (
              <span className="project-tag" key={t}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="project-card-right">
        <div className="project-votes">
          <span className="project-votes-num" id={votesId}>
            {isVotingOpen ? votes : "—"}
          </span>
          <span className="project-votes-label">{t("votesLabel")}</span>
        </div>
        <button
          className={btnClass}
          type="button"
          id={btnId}
          disabled={disabled}
          onClick={() => onVote(realTeam)}
        >
          {label}
        </button>
      </div>
    </div>
  );
}

/* The "+23 projekta" collapsed stub (hides itself on click). */
export function MoreProjectsStub() {
  const t = useT(M);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <button
      id="more-projects-stub"
      type="button"
      className="more-projects-stub"
      onClick={() => setHidden(true)}
    >
      <span>{t("moreProjectsCount")}</span>
      <span className="more-projects-hint">{t("moreProjectsHint")}</span>
    </button>
  );
}

/* The rezultati team-select dropdown (shared markup). */
export function RezSelect({
  id,
  ariaLabel,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useT(M);
  const ph = placeholder ?? t("selectTeam");
  return (
    <select
      id={id}
      className="rezultati-select"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{ph}</option>
      {TEAM_OPTIONS.map((t) => (
        <option value={t} key={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
