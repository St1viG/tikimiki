"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { OrbArt } from "@/components/ui/OrbArt";
import { PremiumBadge } from "@/components/ui/PremiumBadge";
import { useLanguage, useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getFollowers,
  getFollowing,
  getPublicProfile,
  startConversation,
  toggleFollow,
  type PublicProfile,
  type SocialUser,
} from "@/lib/api";
import { personName } from "@/lib/displayName";
import { profileDecorationStyle, usernameEffectStyle, withDecorationClass } from "@/lib/cosmetics";
import "./ProfilePopup.css";

/**
 * ProfilePopup — re-usable, data-driven profile modal.
 *
 * Pass the `username` of the profile to show; it loads the public profile
 * (GET /api/v1/users/:username) and renders it. Used both for the current user
 * (bottom-left rail) and for any user clicked elsewhere (e.g. cohor members).
 */

const M = {
  close: { en: "Close", sr: "Zatvori" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  notFound: { en: "Profile unavailable.", sr: "Profil nije dostupan." },
  editProfile: { en: "Edit profile", sr: "Izmena profila" },
  openProfile: { en: "Open profile", sr: "Otvori profil" },
  follow: { en: "Follow", sr: "Zaprati" },
  unfollow: { en: "Following", sr: "Pratiš ✓" },
  message: { en: "Message", sr: "Poruka" },
  back: { en: "Back", sr: "Nazad" },
  noFollowers: { en: "No followers yet.", sr: "Još nema pratilaca." },
  noFollowing: { en: "Not following anyone.", sr: "Ne prati nikoga." },
  skills: { en: "Skills", sr: "Veštine" },
  tabOverview: { en: "Overview", sr: "Pregled" },
  tabBadges: { en: "Badges", sr: "Bedževi" },
  statXp: { en: "XP", sr: "XP" },
  statBadges: { en: "Badges", sr: "Bedževi" },
  statFollowers: { en: "Followers", sr: "Pratioci" },
  following: { en: "Following", sr: "Prati" },
  memberSince: { en: "Member since", sr: "Član od" },
  earnedBadges: { en: "Earned badges", sr: "Zarađeni bedževi" },
  noBadges: { en: "No badges earned yet.", sr: "Još nema zarađenih bedževa." },
  noSkills: { en: "No skills listed.", sr: "Nema navedenih veština." },
  badgeHowTo: { en: "How to earn it", sr: "Kako se dobija" },
  badgeAwarded: { en: "Earned", sr: "Osvojen" },
  badgeDetails: { en: "Badge details", sr: "Detalji bedža" },
} as const;

/**
 * Translations for known badges, keyed by their DB `name`. The DB stores a
 * single description (English fallback for badges seeded before i18n / the
 * Serbian legacy seeds); anything not listed here falls back to that value.
 */
const BADGE_I18N: Record<string, { en: string; sr: string }> = {
  Flawless4: {
    en: "Complete the Groups daily game without a single mistake.",
    sr: "Pređi dnevnu igru Grupe bez ijedne greške.",
  },
  "Prvi hakaton": {
    en: "Participated in a first hackathon.",
    sr: "Učestvovao na prvom hakatonu.",
  },
  "Timski igrač": { en: "Formed a team.", sr: "Formirao tim." },
  Pobednik: { en: "Won a hackathon prize.", sr: "Osvojio nagradu." },
};

type PpTab = "overview" | "badges";

interface ProfilePopupProps {
  open: boolean;
  onClose: () => void;
  /** Username of the profile to display. */
  username: string | null;
}

const MONTHS_SR = [
  "januara",
  "februara",
  "marta",
  "aprila",
  "maja",
  "juna",
  "jula",
  "avgusta",
  "septembra",
  "oktobra",
  "novembra",
  "decembra",
];

function joinedLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_SR[d.getMonth()]} ${d.getFullYear()}.`;
}

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Locale-aware full date, e.g. "14. jula 2026." / "July 14, 2026". */
function awardedLabel(iso: string, locale: "en" | "sr"): string {
  const d = new Date(iso);
  if (locale === "sr") return `${d.getDate()}. ${MONTHS_SR[d.getMonth()]} ${d.getFullYear()}.`;
  return `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

type ProfileBadge = PublicProfile["badges"][number];

/** How a badge is earned, in the viewer's language (DB description as fallback). */
function badgeDescription(b: ProfileBadge, locale: "en" | "sr"): string {
  return BADGE_I18N[b.name]?.[locale] ?? b.description;
}

/** Circular badge art: the badge's SVG icon, falling back to a trophy glyph. */
function BadgeArt({ iconUrl, name }: { iconUrl: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!iconUrl || failed) {
    return (
      <span className="pp-badge-fallback" aria-hidden="true">
        <Icon name="trophy" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={iconUrl} alt={name} onError={() => setFailed(true)} />
  );
}

export function ProfilePopup({ open, onClose, username }: ProfilePopupProps) {
  const t = useT(M);
  const { locale } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PpTab>("overview");
  const [modalKey, setModalKey] = useState(0);
  const prevOpenRef = useRef(false);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  // Follow state (mirrors profile.isFollowing / followerCount so the button + count update live).
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  // Followers/following sub-view (null = show normal tabs).
  const [listMode, setListMode] = useState<"followers" | "following" | null>(null);
  const [listUsers, setListUsers] = useState<SocialUser[] | null>(null);
  // Badge whose details (how to earn + award date) are open in the badges tab.
  const [selectedBadge, setSelectedBadge] = useState<ProfileBadge | null>(null);

  const onToggleFollow = async () => {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    try {
      const r = await toggleFollow(profile.userId);
      setFollowing(r.following);
      setFollowerCount(r.followerCount);
    } catch {
      /* ignore */
    } finally {
      setFollowBusy(false);
    }
  };

  const openList = (mode: "followers" | "following") => {
    if (!username) return;
    setListMode(mode);
    setListUsers(null);
    const fetcher = mode === "followers" ? getFollowers : getFollowing;
    fetcher(username)
      .then(setListUsers)
      .catch(() => setListUsers([]));
  };

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setModalKey((k) => k + 1);
      setActiveTab("overview");
    }
    prevOpenRef.current = open;
  }, [open]);

  // Load the profile whenever the popup opens for a username.
  useEffect(() => {
    if (!open || !username) return;
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setListMode(null);
    setListUsers(null);
    setSelectedBadge(null);
    getPublicProfile(username)
      .then((p) => {
        if (!cancelled) {
          setProfile(p);
          setFollowing(p.isFollowing);
          setFollowerCount(p.followerCount);
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, username]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !username) return null;

  // `handle` is the stable @username (used for the avatar seed, profile link and
  // aria); `fullName` is the primary label (display name when set, else username).
  const handle = username;
  const fullName = profile ? personName(profile) : username;
  const isOwn = user?.username === username;

  return (
    <div
      className="pp-overlay"
      id="pp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={fullName}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={withDecorationClass("pp-modal", profile?.profileDecoration)}
        id="pp-modal"
        key={modalKey}
        style={profileDecorationStyle(profile?.profileDecoration)}
      >
        <button className="pp-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="x" />
        </button>

        {/* LEFT */}
        <div className="pp-left">
          <div
            className="pp-banner"
            style={
              profile?.bannerUrl
                ? {
                    backgroundImage: `url(${profile.bannerUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            <div className="pp-avatar-wrap">
              <div className="pp-avatar is-orb">
                <OrbArt url={profile?.avatarUrl} seed={handle} />
                <span className="pp-status-dot" aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="pp-card-body">
            <div className="pp-name" style={usernameEffectStyle(profile?.usernameEffect)}>
              {fullName}
              {profile?.isPremium && <PremiumBadge size={15} />}
            </div>
            <div className="pp-handle">@{handle}</div>

            <div
              style={{
                marginTop: "12px",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {isOwn && (
                <Link className="btn btn-violet" href="/settings" onClick={onClose}>
                  <Icon name="settings" /> {t("editProfile")}
                </Link>
              )}
              {!isOwn && user && profile && (
                <button
                  type="button"
                  className={following ? "btn btn-ghost" : "btn btn-violet"}
                  onClick={onToggleFollow}
                  disabled={followBusy}
                >
                  <Icon name={following ? "check" : "plus"} />{" "}
                  {following ? t("unfollow") : t("follow")}
                </button>
              )}
              {!isOwn && user && profile && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    const id = await startConversation(profile.userId);
                    onClose();
                    router.push(`/cohor?dm=${id}`);
                  }}
                >
                  <Icon name="comment" /> {t("message")}
                </button>
              )}
              <Link className="btn btn-ghost" href={`/u/${handle}`} onClick={onClose}>
                <Icon name="link" /> {t("openProfile")}
              </Link>
            </div>

            {profile?.bio && <div className="pp-short-bio">{profile.bio}</div>}

            {profile && (
              <div className="pp-joined-date">
                <Icon name="calendar" /> {t("memberSince")} {joinedLabel(profile.createdAt)}
              </div>
            )}

            <div className="pp-card-divider" />

            <div className="pp-side-info">
              <div className="pp-section-label">{t("skills")}</div>
              <div className="pp-skills">
                {profile && profile.skills.length > 0 ? (
                  profile.skills.map((s) => (
                    <span className="tag tag-v" key={s}>
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="pp-handle">{t("noSkills")}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="pp-right">
          {loading ? (
            <div className="pp-empty">{t("loading")}</div>
          ) : !profile ? (
            <div className="pp-empty">
              <Icon name="shield" /> {t("notFound")}
            </div>
          ) : listMode ? (
            <div className="pp-tab-content">
              <button
                className="pp-tab active"
                type="button"
                onClick={() => setListMode(null)}
                style={{ marginBottom: 10 }}
              >
                ← {t("back")}
              </button>
              <div className="pp-section-label">
                {listMode === "followers" ? t("statFollowers") : t("following")}
              </div>
              {listUsers === null ? (
                <div className="pp-empty">{t("loading")}</div>
              ) : listUsers.length === 0 ? (
                <div className="pp-empty">
                  {listMode === "followers" ? t("noFollowers") : t("noFollowing")}
                </div>
              ) : (
                <div className="pp-hack-list">
                  {listUsers.map((u) => (
                    <Link
                      key={u.userId}
                      href={`/u/${u.username}`}
                      className="pp-hack-item"
                      onClick={onClose}
                      style={{ textDecoration: "none", cursor: "pointer" }}
                    >
                      <span className="pp-avatar is-orb" style={{ width: 34, height: 34 }}>
                        <OrbArt url={u.avatarUrl} seed={u.username} />
                      </span>
                      <div className="pp-hack-info">
                        <div className="pp-hack-name">{personName(u)}</div>
                        <div className="pp-handle">@{u.username}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="pp-tabs" role="tablist">
                <button
                  className={`pp-tab${activeTab === "overview" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "overview"}
                  onClick={() => setActiveTab("overview")}
                >
                  {t("tabOverview")}
                </button>
                <button
                  className={`pp-tab${activeTab === "badges" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "badges"}
                  onClick={() => {
                    setActiveTab("badges");
                    setSelectedBadge(null);
                  }}
                >
                  {t("tabBadges")}
                </button>
              </div>

              <div className="pp-tab-content">
                <div
                  className={`pp-panel${activeTab === "overview" ? " active" : ""}`}
                  id="tab-overview"
                >
                  <div className="pp-mini-stats">
                    <div className="pp-mini-stat pp-mini-stat--hero">
                      <div className="pp-mini-stat-val">
                        {profile.points.toLocaleString("sr-RS")}
                      </div>
                      <div className="pp-mini-stat-lbl">{t("statXp")}</div>
                    </div>
                    <div className="pp-mini-stat">
                      <div className="pp-mini-stat-val">{profile.badges.length}</div>
                      <div className="pp-mini-stat-lbl">{t("statBadges")}</div>
                    </div>
                    <div
                      className="pp-mini-stat"
                      role="button"
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={() => openList("followers")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openList("followers");
                      }}
                    >
                      <div className="pp-mini-stat-val">{followerCount}</div>
                      <div className="pp-mini-stat-lbl">{t("statFollowers")}</div>
                    </div>
                  </div>

                  <div className="pp-section-label">{t("following")}</div>
                  <div
                    className="pp-meta-row"
                    role="button"
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={() => openList("following")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openList("following");
                    }}
                  >
                    <Icon name="teams" /> {profile.followingCount}
                  </div>
                </div>

                <div
                  className={`pp-panel${activeTab === "badges" ? " active" : ""}`}
                  id="tab-badges"
                >
                  {selectedBadge ? (
                    /* Badge details: how to earn it + when this user earned it. */
                    <div className="pp-badge-detail" aria-label={t("badgeDetails")}>
                      <button
                        className="pp-tab active"
                        type="button"
                        onClick={() => setSelectedBadge(null)}
                        style={{ marginBottom: 10 }}
                      >
                        ← {t("back")}
                      </button>
                      <div className="pp-badge-detail-head">
                        <span className="pp-badge-circle pp-badge-circle-lg">
                          <BadgeArt iconUrl={selectedBadge.iconUrl} name={selectedBadge.name} />
                        </span>
                        <div>
                          <div className="pp-badge-detail-name">{selectedBadge.name}</div>
                          <div className="pp-badge-detail-cat">{selectedBadge.category}</div>
                        </div>
                      </div>
                      <div className="pp-section-label">{t("badgeHowTo")}</div>
                      <p className="pp-badge-detail-desc">
                        {badgeDescription(selectedBadge, locale)}
                      </p>
                      <div className="pp-badge-detail-awarded">
                        <Icon name="calendar" /> {t("badgeAwarded")}:{" "}
                        {awardedLabel(selectedBadge.awardedAt, locale)}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="pp-section-label">{t("earnedBadges")}</div>
                      {profile.badges.length === 0 ? (
                        <div className="pp-empty">
                          <Icon name="shield" /> {t("noBadges")}
                        </div>
                      ) : (
                        <div className="pp-badges-grid">
                          {profile.badges.map((b) => (
                            <button
                              className="pp-badge-item"
                              type="button"
                              key={b.badgeId}
                              title={b.name}
                              onClick={() => setSelectedBadge(b)}
                            >
                              <span className="pp-badge-circle">
                                <BadgeArt iconUrl={b.iconUrl} name={b.name} />
                              </span>
                              <span className="pp-badge-name">{b.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfilePopup;
