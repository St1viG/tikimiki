"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { OrbArt } from "@/components/ui/OrbArt";
import { PostMedia } from "@/components/PostMedia";
import { MarkdownContent } from "@/components/MarkdownContent";
import { useAuth } from "@/components/auth/AuthProvider";
import { useT, useLanguage } from "@/components/i18n/LanguageProvider";
import type { FeedPost } from "@tikimiki/types";
import {
  type PublicProfile,
  type SocialUser,
  getFollowers,
  getFollowing,
  getPublicProfile,
  getUserPosts,
  togglePostLike,
  toggleFollow,
  startConversation,
} from "@/lib/api";
import { monthYear } from "@/lib/format";
import { personName } from "@/lib/displayName";
import { PostAuthor } from "@/components/PostAuthor";
import { ProfilePopup } from "@/components/popups/ProfilePopup";

/** Public account page at /u/[username]: profile header + posts / followers / following / badges. */

const M = {
  back:           { en: "Back",                       sr: "Nazad" },
  pageSub:        { en: "Profile & posts",            sr: "Profil i objave" },
  loading:        { en: "Loading…",                   sr: "Učitavanje…" },
  notFound:       { en: "Profile not found.",         sr: "Profil nije pronađen." },
  edit:           { en: "Edit",                       sr: "Izmena" },
  follow:         { en: "Follow",                     sr: "Zaprati" },
  following:      { en: "Following ✓",                sr: "Pratiš ✓" },
  memberSince:    { en: "member since",               sr: "član od" },
  statXp:         { en: "XP",                         sr: "XP" },
  tabPosts:       { en: "Posts",                      sr: "Objave" },
  tabFollowers:   { en: "Followers",                  sr: "Pratioci" },
  tabFollowing:   { en: "Following",                  sr: "Prati" },
  tabBadges:      { en: "Badges",                     sr: "Bedževi" },
  sections:       { en: "Profile sections",           sr: "Sekcije profila" },
  noPosts:        { en: "No posts yet.",              sr: "Još nema objava." },
  noFollowers:    { en: "No followers yet.",          sr: "Nema pratilaca." },
  noFollowing:    { en: "Not following anyone.",      sr: "Ne prati nikoga." },
  noBadges:       { en: "No badges yet.",             sr: "Još nema bedževa." },
  message:        { en: "Message",                    sr: "Poruka" },
} as const;

type Tab = "posts" | "followers" | "following" | "badges";

export function UserProfileClient({ username }: { username: string }) {
  const { user } = useAuth();
  const t = useT(M);
  const { locale } = useLanguage();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");

  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [followers, setFollowers] = useState<SocialUser[] | null>(null);
  const [followingList, setFollowingList] = useState<SocialUser[] | null>(null);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [popupUser, setPopupUser] = useState<string | null>(null);

  const joined = (iso: string) => monthYear(iso, locale);

  const onToggleFollow = async () => {
    if (!profile || followBusy) return;
    setFollowBusy(true);
    try {
      const r = await toggleFollow(profile.userId);
      setIsFollowing(r.following);
      setFollowerCount(r.followerCount);
    } catch {
      /* ignore */
    } finally {
      setFollowBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getPublicProfile(username)
      .then((p) => {
        if (!cancelled) {
          setProfile(p);
          setIsFollowing(p.isFollowing);
          setFollowerCount(p.followerCount);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (notFound) return;
    if (tab === "posts" && posts === null) {
      getUserPosts(username)
        .then((p) => {
          setPosts(p);
          setLikedSet(new Set(p.filter((x) => x.likedByMe).map((x) => x.postId)));
        })
        .catch(() => setPosts([]));
    }
    if (tab === "followers" && followers === null)
      getFollowers(username).then(setFollowers).catch(() => setFollowers([]));
    if (tab === "following" && followingList === null)
      getFollowing(username).then(setFollowingList).catch(() => setFollowingList([]));
  }, [tab, username, notFound, posts, followers, followingList]);

  const toggleLike = async (id: string) => {
    const wasLiked = likedSet.has(id);
    setLikedSet((prev) => {
      const n = new Set(prev);
      wasLiked ? n.delete(id) : n.add(id);
      return n;
    });
    try {
      const r = await togglePostLike(id);
      setPosts((prev) =>
        prev?.map((p) => (p.postId === id ? { ...p, reactionCount: r.reactionCount } : p)) ?? prev,
      );
      setLikedSet((prev) => {
        const n = new Set(prev);
        r.liked ? n.add(id) : n.delete(id);
        return n;
      });
    } catch {
      setLikedSet((prev) => {
        const n = new Set(prev);
        wasLiked ? n.add(id) : n.delete(id);
        return n;
      });
    }
  };

  const name = profile?.username ?? username;
  const displayName = personName({ displayName: profile?.displayName, username: name });
  const isOwn = user?.username === username;

  const userRow = (u: SocialUser) => (
    <Link
      key={u.userId}
      href={`/u/${u.username}`}
      className="post"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, textDecoration: "none" }}
    >
      <span className="avatar v is-orb" aria-hidden="true" style={{ width: 40, height: 40 }}>
        <OrbArt url={u.avatarUrl} seed={u.username} />
      </span>
      <span className="who">
        <span className="name">{personName({ displayName: u.displayName, username: u.username })}</span>
        <span className="post-handle">@{u.username}</span>
      </span>
    </Link>
  );

  const userRowSkeleton = (
    <div aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          className="post"
          key={i}
          aria-hidden="true"
          style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 } as React.CSSProperties}
        >
          <span
            className="avatar v is-orb skel skel-circle"
            style={{ width: 40, height: 40 } as React.CSSProperties}
          />
          <span style={{ flex: 1 }}>
            <span className="skel skel-line" style={{ width: "38%" } as React.CSSProperties} />
            <span className="skel skel-line" style={{ width: "24%", marginTop: 6 } as React.CSSProperties} />
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <AppShell right={<RailRight />}>
      <main className="feed" id="main">
        <div className="page-head">
          <Link className="col-back" href="/" aria-label={t("back")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">{displayName}</h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        {loading ? (
          <div
            className="post reveal"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
            aria-busy="true"
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center" }} aria-hidden="true">
              <span
                className="avatar v is-orb skel skel-circle"
                style={{ width: 72, height: 72 }}
              />
              <div style={{ flex: 1 }}>
                <span className="skel skel-line" style={{ width: "40%", height: 18 } as React.CSSProperties} />
                <span className="skel skel-line" style={{ width: "25%", marginTop: 8 } as React.CSSProperties} />
                <span className="skel skel-line" style={{ width: "80%", marginTop: 10 } as React.CSSProperties} />
                <span className="skel skel-line" style={{ width: "55%", marginTop: 7 } as React.CSSProperties} />
              </div>
              <span className="skel" style={{ width: 96, height: 36, borderRadius: 10 } as React.CSSProperties} />
            </div>

            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} style={{ display: "inline-block" }}>
                  <span className="skel skel-line" style={{ width: 34, height: 16 } as React.CSSProperties} />
                  <span className="skel skel-line" style={{ width: 48, marginTop: 6 } as React.CSSProperties} />
                </span>
              ))}
            </div>
          </div>
        ) : notFound || !profile ? (
          <p className="page-sub" style={{ padding: "0 4px" }}>{t("notFound")}</p>
        ) : (
          <>
            <div className="post reveal" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span className="avatar v is-orb" aria-hidden="true" style={{ width: 72, height: 72 }}>
                  <OrbArt url={profile?.avatarUrl} seed={name} />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="name" style={{ fontSize: 20, fontWeight: 700 }}>{displayName}</div>
                  <div className="time"><span className="post-handle">@{name}</span> · {t("memberSince")} {joined(profile.createdAt)}</div>
                  {profile.bio && <p className="post-body" style={{ marginTop: 6 }}>{profile.bio}</p>}
                </div>
                {isOwn ? (
                  <Link className="btn btn-violet" href="/settings">
                    <Icon name="settings" /> {t("edit")}
                  </Link>
                ) : (
                  user && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className={isFollowing ? "btn btn-ghost" : "btn btn-violet"}
                        onClick={onToggleFollow}
                        disabled={followBusy}
                      >
                        <Icon name={isFollowing ? "check" : "plus"} />{" "}
                        {isFollowing ? t("following") : t("follow")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={async () => {
                          const id = await startConversation(profile.userId);
                          router.push(`/cohor?dm=${id}`);
                        }}
                      >
                        <Icon name="comment" /> {t("message")}
                      </button>
                    </div>
                  )
                )}
              </div>

              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                <Stat label={t("statXp")} value={profile.points.toLocaleString(locale === "sr" ? "sr-RS" : "en-US")} />
                <Stat label={t("tabPosts")} value={posts?.length ?? "–"} onClick={() => setTab("posts")} />
                <Stat label={t("tabFollowers")} value={followerCount} onClick={() => setTab("followers")} />
                <Stat label={t("tabFollowing")} value={profile.followingCount} onClick={() => setTab("following")} />
                <Stat label={t("tabBadges")} value={profile.badges.length} onClick={() => setTab("badges")} />
              </div>

              {profile.skills.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {profile.skills.map((s) => (
                    <span className="tag tag-v" key={s}>{s}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="feed-switch" role="tablist" aria-label={t("sections")} style={{ marginTop: 4 }}>
              {(["posts", "followers", "following", "badges"] as Tab[]).map((tb) => (
                <button
                  key={tb}
                  className="feed-tab"
                  role="tab"
                  aria-selected={tab === tb}
                  onClick={() => setTab(tb)}
                >
                  {tb === "posts" ? t("tabPosts") : tb === "followers" ? t("tabFollowers") : tb === "following" ? t("tabFollowing") : t("tabBadges")}
                </button>
              ))}
            </div>

            {tab === "posts" && (
              <>
                {posts === null && (
                  <div aria-busy="true">
                    {[0, 1, 2].map((i) => (
                      <article className="post" key={i} aria-hidden="true">
                        <div className="post-head">
                          <span className="avatar v is-orb skel skel-circle" />
                          <span className="who">
                            <span className="skel skel-line" style={{ width: "32%" } as React.CSSProperties} />
                            <span className="skel skel-line" style={{ width: "18%", marginTop: 6 } as React.CSSProperties} />
                          </span>
                        </div>
                        <span className="skel skel-line" style={{ width: "92%", marginTop: 10 } as React.CSSProperties} />
                        <span className="skel skel-line" style={{ width: "70%", marginTop: 7 } as React.CSSProperties} />
                      </article>
                    ))}
                  </div>
                )}
                {posts?.length === 0 && <p className="time" style={{ padding: 8 }}>{t("noPosts")}</p>}
                {posts?.map((p, idx) => {
                  const liked = likedSet.has(p.postId);
                  return (
                    <article className="post reveal" key={p.postId} style={{ "--i": idx } as React.CSSProperties}>
                      <div className="post-head">
                        <PostAuthor
                          username={p.authorUsername}
                          displayName={p.authorDisplayName}
                          avatarUrl={p.authorAvatarUrl}
                          createdAt={p.createdAt}
                          locale={locale}
                          onOpenProfile={setPopupUser}
                        />
                      </div>
                      {p.content && (
                        <div className="post-body">
                          <MarkdownContent>{p.content}</MarkdownContent>
                        </div>
                      )}
                      {p.attachments && p.attachments.length > 0 && (
                        <PostMedia items={p.attachments} lightbox />
                      )}
                      <div className="post-actions">
                        <button className="act" aria-pressed={liked || undefined} onClick={() => toggleLike(p.postId)}>
                          <Icon name={liked ? "like-fill" : "like"} className="heart" /> <span>{p.reactionCount}</span>
                        </button>
                        <span className="act"><Icon name="comment" /> <span>{p.commentCount}</span></span>
                      </div>
                    </article>
                  );
                })}
              </>
            )}

            {tab === "followers" && (
              <div style={{ display: "grid", gap: 8 }}>
                {followers === null && userRowSkeleton}
                {followers?.length === 0 && <p className="time" style={{ padding: 8 }}>{t("noFollowers")}</p>}
                {followers?.map(userRow)}
              </div>
            )}
            {tab === "following" && (
              <div style={{ display: "grid", gap: 8 }}>
                {followingList === null && userRowSkeleton}
                {followingList?.length === 0 && <p className="time" style={{ padding: 8 }}>{t("noFollowing")}</p>}
                {followingList?.map(userRow)}
              </div>
            )}

            {tab === "badges" && (
              <div className="post" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {profile.badges.length === 0 ? (
                  <p className="time">{t("noBadges")}</p>
                ) : (
                  profile.badges.map((b) => (
                    <span className="tag tag-v" key={b.badgeId} title={b.category}>
                      <Icon name="trophy" /> {b.name}
                    </span>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>
      <ProfilePopup
        open={popupUser !== null}
        username={popupUser}
        onClose={() => setPopupUser(null)}
      />
    </AppShell>
  );
}

function Stat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number | string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ background: "none", border: "none", padding: 0, cursor: onClick ? "pointer" : "default", textAlign: "left" }}
    >
      <div className="name" style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div className="time">{label}</div>
    </button>
  );
}

export default UserProfileClient;
