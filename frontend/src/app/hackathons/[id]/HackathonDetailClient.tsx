"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HackathonSummary, HackathonType } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { CalendarPopup } from "@/components/popups/CalendarPopup";
import { initials } from "@/lib/format";
import {
  castVote,
  getHackathon,
  getHackathonProjects,
  getHackathonResults,
  getMyApplications,
  getMyVote,
  getVotingStatus,
  type Application,
  type HackathonResults,
  type ProjectVote,
} from "@/lib/api";

/**
 * SSU14: guests vote with a stable, client-generated fingerprint instead of
 * an account. Kept in localStorage so a guest can't re-vote from the same
 * browser; created lazily on first use.
 */
function guestFingerprint(): string {
  const KEY = "tikimiki_guest_fp";
  let fp = localStorage.getItem(KEY);
  if (!fp) {
    fp = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(KEY, fp);
  }
  return fp;
}

/**
 * HackathonDetailClient — full hackathon profile on a dedicated route.
 *
 * Renders the banner/organizer hero, the full description, a schedule + stats
 * grid, the geographic location as readable text PLUS an embedded Google Map
 * (when coordinates are set), and a context-aware apply CTA (sign-in / apply /
 * already-applied / your-own-hackathon). Every field is rendered only when the
 * backend actually provides it — nothing is faked.
 */

const M = {
  back: { en: "Hackathons", sr: "Hackathoni" },
  pageTitle: { en: "Hackathon", sr: "Hackathon" },

  notFound: { en: "Hackathon not found.", sr: "Hackathon nije pronađen." },
  browse: { en: "Browse hackathons", sr: "Pregledaj hackathone" },

  by: { en: "by", sr: "organizuje" },
  verifiedOrg: { en: "Verified organizer", sr: "Verifikovan organizator" },

  statusUpcoming: { en: "Upcoming", sr: "Predstojeći" },
  statusLive: { en: "Live now", sr: "U toku" },
  statusFinished: { en: "Finished", sr: "Završen" },
  statusCancelled: { en: "Cancelled", sr: "Otkazan" },

  // Meta
  metaWhen: { en: "When", sr: "Kada" },
  metaParticipants: { en: "Participants", sr: "Učesnici" },
  metaTeams: { en: "Teams", sr: "Timovi" },
  metaPrize: { en: "Main prize", sr: "Glavna nagrada" },
  metaDeadline: { en: "Apply by", sr: "Rok za prijavu" },
  addToCalendar: { en: "Add to calendar", sr: "Dodaj u kalendar" },

  // Sections
  aboutTitle: { en: "About", sr: "O hackathonu" },
  locationTitle: { en: "Location", sr: "Lokacija" },
  locationVirtual: {
    en: "This is a virtual hackathon — it takes place online.",
    sr: "Ovo je virtuelni hackathon — održava se online.",
  },
  viewOnMaps: { en: "View on Google Maps", sr: "Otvori u Google Maps" },
  mapTitle: { en: "Hackathon location map", sr: "Mapa lokacije hackathona" },

  // CTA
  ctaApply: { en: "Apply to this hackathon", sr: "Prijavi se na ovaj hackathon" },
  ctaSignIn: { en: "Sign in to apply", sr: "Prijavi se da konkurišeš" },
  signIn: { en: "Sign in", sr: "Prijava" },
  ctaApplied: { en: "You've applied", sr: "Već si se prijavio" },
  viewApplication: { en: "View application", sr: "Pogledaj prijavu" },
  ctaOwn: { en: "This is your hackathon.", sr: "Ovo je tvoj hackathon." },
  manageApps: { en: "Manage applications", sr: "Upravljaj prijavama" },
  editHackathon: { en: "Edit", sr: "Izmeni" },
  deadlinePassed: { en: "Applications are closed.", sr: "Prijave su zatvorene." },

  statusPending: { en: "Pending review", sr: "Na čekanju" },
  statusApproved: { en: "Approved", sr: "Odobreno" },
  statusRejected: { en: "Rejected", sr: "Odbijeno" },
  statusWaitlisted: { en: "Waitlisted", sr: "Lista čekanja" },

  typePhysical: { en: "Physical", sr: "Fizički" },
  typeVirtual: { en: "Virtual", sr: "Virtuelni" },
  typeHybrid: { en: "Hybrid", sr: "Hibridni" },

  // Official results (published podium + sponsor bounty winners)
  resultsTitle: { en: "Results", sr: "Rezultati" },
  resultsSponsor: { en: "Sponsor awards", sr: "Sponzorske nagrade" },
  resultsPlace1: { en: "1st place", sr: "1. mesto" },
  resultsPlace2: { en: "2nd place", sr: "2. mesto" },
  resultsPlace3: { en: "3rd place", sr: "3. mesto" },
  resultsPlaceN: { en: ". place", sr: ". mesto" },

  // Audience voting (open to guests too — SSU14)
  votingTitle: { en: "Audience voting", sr: "Glasanje publike" },
  votingOpenHint: {
    en: "Voting is open — pick your favourite project. No account needed.",
    sr: "Glasanje je otvoreno — izaberi omiljeni projekat. Nalog nije potreban.",
  },
  voteBtn: { en: "Vote", sr: "Glasaj" },
  votedBadge: { en: "Your vote", sr: "Tvoj glas" },
  votesLabel: { en: "votes", sr: "glasova" },
} as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDMY(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
}
function dateRange(aIso: string, bIso: string): string {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (a.toDateString() === b.toDateString()) return fmtDMY(a);
  return `${fmtDMY(a)} – ${fmtDMY(b)}`;
}

export function HackathonDetailClient({ hackathonId }: { hackathonId: string }) {
  const t = useT(M);
  const { user } = useAuth();

  const typeLabel = (ty: HackathonType): string =>
    ty === "virtual" ? t("typeVirtual") : ty === "hybrid" ? t("typeHybrid") : t("typePhysical");

  const [hack, setHack] = useState<HackathonSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [existing, setExisting] = useState<Application | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [results, setResults] = useState<HackathonResults | null>(null);
  const [votingOpen, setVotingOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectVote[]>([]);
  const [votedProjectId, setVotedProjectId] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHackathon(hackathonId)
      .then((h) => !cancelled && setHack(h))
      .catch(() => !cancelled && setLoadFailed(true));
    // Official results are public — shown once the organizer publishes them.
    getHackathonResults(hackathonId)
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults(null));
    // Audience voting is public too (guests vote via fingerprint — SSU14).
    getVotingStatus(hackathonId)
      .then((s) => {
        if (cancelled) return;
        setVotingOpen(s.isOpen);
        if (!s.isOpen) return;
        getHackathonProjects(hackathonId)
          .then((p) => !cancelled && setProjects(p))
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  // The caller's existing vote: by account when signed in, else by the
  // guest fingerprint stored in this browser.
  useEffect(() => {
    if (!votingOpen) return;
    let cancelled = false;
    getMyVote(hackathonId, user ? undefined : guestFingerprint())
      .then((v) => !cancelled && setVotedProjectId(v.projectId))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [votingOpen, user, hackathonId]);

  const onVote = async (projectId: string) => {
    if (voteBusy || votedProjectId) return;
    setVoteBusy(true);
    try {
      const res = await castVote(hackathonId, projectId, user ? undefined : guestFingerprint());
      setVotedProjectId(projectId);
      setProjects((prev) =>
        prev.map((p) => (p.projectId === projectId ? { ...p, voteCount: res.voteCount } : p)),
      );
    } catch {
      /* backend governs the voting window / duplicate votes */
    } finally {
      setVoteBusy(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setExisting(null);
      return;
    }
    let cancelled = false;
    getMyApplications()
      .then((apps) => {
        if (!cancelled) setExisting(apps.find((a) => a.hackathonId === hackathonId) ?? null);
      })
      .catch(() => !cancelled && setExisting(null));
    return () => {
      cancelled = true;
    };
  }, [user, hackathonId]);

  const header = (
    <header className="page-head hd-head">
      <Link className="col-back" href="/hackathons" aria-label={t("back")}>
        <Icon name="arrow-left" />
      </Link>
      <div className="col-titles">
        <h1 className="page-title">
          <Icon name="hackathon" /> {t("pageTitle")}
        </h1>
        <p className="page-sub">{hack?.title ?? ""}</p>
      </div>
    </header>
  );

  /* Loading / not-found */
  if (hack === null) {
    return (
      <AppShell right={<RailRight />}>
        <main className="hd-page" id="hd-main">
          {header}
          {loadFailed ? (
            <div className="hd-state">
              <h2 className="hd-state-title">{t("notFound")}</h2>
              <Link className="btn btn-ghost" href="/hackathons">
                {t("browse")}
              </Link>
            </div>
          ) : (
            <div className="hd-hero" aria-busy="true">
              <span className="skel skel-line" style={{ width: "40%", height: 14 }} />
              <span
                className="skel skel-line"
                style={{ width: "70%", height: 28, marginTop: 12 }}
              />
              <span
                className="skel skel-line"
                style={{ width: "55%", height: 13, marginTop: 14 }}
              />
            </div>
          )}
        </main>
      </AppShell>
    );
  }

  const statusLabel =
    hack.status === "ongoing"
      ? t("statusLive")
      : hack.status === "finished"
        ? t("statusFinished")
        : hack.status === "cancelled"
          ? t("statusCancelled")
          : t("statusUpcoming");

  const appStatusLabel = (s: string): string =>
    s === "approved"
      ? t("statusApproved")
      : s === "rejected"
        ? t("statusRejected")
        : s === "waitlisted"
          ? t("statusWaitlisted")
          : t("statusPending");
  const appStatusClass = (s: string): string =>
    s === "approved"
      ? "hk-apply-approved"
      : s === "rejected"
        ? "hk-apply-rejected"
        : s === "waitlisted"
          ? "hk-apply-waitlisted"
          : "hk-apply-pending";

  const isOwner = user?.userId === hack.organizationId;
  const hasCoords = hack.latitude != null && hack.longitude != null;
  const deadlinePassed = new Date(hack.registrationDeadline).getTime() < Date.now();
  const canApply = !isOwner && hack.status === "upcoming" && !deadlinePassed && !existing;

  const mapsQuery = hasCoords
    ? `${hack.latitude},${hack.longitude}`
    : encodeURIComponent(hack.location ?? "");

  return (
    <AppShell right={<RailRight />}>
      <main className="hd-page" id="hd-main">
        {header}

        {/* Hero */}
        <div className="hd-hero">
          {hack.bannerUrl && (
            <div className="hd-hero-banner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hack.bannerUrl} alt="" loading="lazy" />
              <div className="hd-hero-dim" aria-hidden="true" />
            </div>
          )}
          <div className="hd-hero-body">
            <div className="hd-org">
              <div className="hd-org-av" aria-hidden="true">
                {hack.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hack.logoUrl} alt="" />
                ) : (
                  initials(hack.organizationName)
                )}
              </div>
              <span className="hd-org-name">
                {t("by")} <strong>{hack.organizationName}</strong>
              </span>
              {hack.organizationVerified && (
                <span className="hk-verify" title={t("verifiedOrg")}>
                  <Icon name="shield" />
                </span>
              )}
            </div>

            <h2 className="hd-hero-title">{hack.title}</h2>

            <div className="hd-hero-tags">
              <span className={`hd-status hd-status-${hack.status}`}>{statusLabel}</span>
              <span className="tag tag-v">{typeLabel(hack.type)}</span>
              {hack.theme && <span className="tag tag-v">{hack.theme}</span>}
            </div>

            {/* Location as readable text (not a badge) */}
            {hack.location && (
              <div className="hd-hero-loc">
                <Icon name="location" className="ic-sm" /> {hack.location}
              </div>
            )}

            {/* Add-to-calendar dropdown, driven by this hackathon's real data */}
            <div className="hk-cal-wrap hd-cal">
              <button
                type="button"
                className="btn btn-ghost hk-cal-btn"
                aria-haspopup="menu"
                aria-expanded={calOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setCalOpen((v) => !v);
                }}
              >
                <Icon name="calendar" /> {t("addToCalendar")}
              </button>
              <CalendarPopup
                open={calOpen}
                onClose={() => setCalOpen(false)}
                title={hack.title}
                location={hack.location ?? undefined}
                startsAt={hack.startsAt}
                endsAt={hack.endsAt}
                description={hack.description ?? undefined}
                url={`/hackathons/${hackathonId}`}
              />
            </div>
          </div>
        </div>

        {/* Apply CTA */}
        <div className="hd-cta">
          {isOwner ? (
            <div className="hd-cta-own">
              <span>{t("ctaOwn")}</span>
              <Link className="btn btn-primary" href={`/hackathons/${hack.hackathonId}/edit`}>
                <Icon name="settings" /> {t("editHackathon")}
              </Link>
              <Link
                className="btn btn-ghost"
                href={`/applications?hackathonId=${hack.hackathonId}`}
              >
                {t("manageApps")}
              </Link>
            </div>
          ) : existing ? (
            <div className="hd-cta-applied">
              <span className={`hk-apply-status ${appStatusClass(existing.status)}`}>
                <Icon
                  name={
                    existing.status === "approved"
                      ? "check"
                      : existing.status === "rejected"
                        ? "x"
                        : "clock"
                  }
                />{" "}
                {appStatusLabel(existing.status)}
              </span>
              <Link className="btn btn-ghost" href={`/hackathons/${hack.hackathonId}/apply`}>
                {t("viewApplication")}
              </Link>
            </div>
          ) : !user ? (
            <Link className="btn btn-primary hd-cta-btn" href="/login">
              <Icon name="flag" /> {t("ctaSignIn")}
            </Link>
          ) : canApply ? (
            <Link
              className="btn btn-primary hd-cta-btn"
              href={`/hackathons/${hack.hackathonId}/apply`}
            >
              <Icon name="flag" /> {t("ctaApply")}
            </Link>
          ) : (
            <p className="hd-cta-closed">{t("deadlinePassed")}</p>
          )}
        </div>

        {/* Meta grid */}
        <div className="hd-meta">
          <div className="hd-meta-item">
            <div className="hd-meta-label">
              <Icon name="calendar" /> {t("metaWhen")}
            </div>
            <div className="hd-meta-val">{dateRange(hack.startsAt, hack.endsAt)}</div>
          </div>
          <div className="hd-meta-item">
            <div className="hd-meta-label">
              <Icon name="teams" /> {t("metaParticipants")}
            </div>
            <div className="hd-meta-val">
              {hack.participantCount}
              {hack.maxParticipants !== null && (
                <span className="hd-meta-cap">/{hack.maxParticipants}</span>
              )}
            </div>
          </div>
          <div className="hd-meta-item">
            <div className="hd-meta-label">
              <Icon name="flag" /> {t("metaTeams")}
            </div>
            <div className="hd-meta-val">{hack.teamCount}</div>
          </div>
          {hack.prizePool && (
            <div className="hd-meta-item">
              <div className="hd-meta-label">
                <Icon name="trophy" /> {t("metaPrize")}
              </div>
              <div className="hd-meta-val hd-meta-prize">{hack.prizePool}</div>
            </div>
          )}
          <div className="hd-meta-item">
            <div className="hd-meta-label">
              <Icon name="clock" /> {t("metaDeadline")}
            </div>
            <div className="hd-meta-val">{fmtDMY(new Date(hack.registrationDeadline))}</div>
          </div>
        </div>

        {/* Official results — public once the organizer publishes them */}
        {results?.published && (
          <section className="hd-section" id="hd-results">
            <h3 className="hd-section-title">
              <Icon name="trophy" className="ic-sm" /> {t("resultsTitle")}
            </h3>
            <ol className="hd-podium">
              {results.podium.map((p) => (
                <li key={p.projectId} className={`hd-podium-row hd-podium-${p.rank ?? "x"}`}>
                  <span className="hd-podium-rank">
                    {p.rank === 1
                      ? `🥇 ${t("resultsPlace1")}`
                      : p.rank === 2
                        ? `🥈 ${t("resultsPlace2")}`
                        : p.rank === 3
                          ? `🥉 ${t("resultsPlace3")}`
                          : `${p.rank ?? "—"}${t("resultsPlaceN")}`}
                  </span>
                  <span className="hd-podium-team">{p.teamName}</span>
                  <span className="hd-podium-project">{p.title}</span>
                </li>
              ))}
            </ol>
            {results.bountyWinners.length > 0 && (
              <>
                <h4 className="hd-section-sub">{t("resultsSponsor")}</h4>
                <ul className="hd-bounty-winners">
                  {results.bountyWinners.map((w) => (
                    <li key={w.bountyId} className="hd-podium-row">
                      <span className="hd-podium-rank">🏅 {w.sponsorName}</span>
                      <span className="hd-podium-team">{w.teamName}</span>
                      <span className="hd-podium-project">
                        {w.bountyTitle} — {w.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {/* Audience voting — open to signed-in members AND guests (SSU14) */}
        {votingOpen && projects.length > 0 && (
          <section className="hd-section" id="hd-voting">
            <h3 className="hd-section-title">
              <Icon name="leaderboard" className="ic-sm" /> {t("votingTitle")}
            </h3>
            <p className="hd-about">{t("votingOpenHint")}</p>
            <ul className="hd-vote-list">
              {projects.map((p) => (
                <li key={p.projectId} className="hd-podium-row">
                  <span className="hd-podium-team">{p.teamName}</span>
                  <span className="hd-podium-project">{p.title}</span>
                  <span className="hd-vote-count">
                    {p.voteCount} {t("votesLabel")}
                  </span>
                  {votedProjectId === p.projectId ? (
                    <span className="hd-vote-badge">
                      <Icon name="check" className="ic-sm" /> {t("votedBadge")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary hd-vote-btn"
                      onClick={() => onVote(p.projectId)}
                      disabled={voteBusy || votedProjectId !== null}
                    >
                      {t("voteBtn")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* About */}
        {hack.description && (
          <section className="hd-section">
            <h3 className="hd-section-title">{t("aboutTitle")}</h3>
            <p className="hd-about">{hack.description}</p>
          </section>
        )}

        {/* Location */}
        {hack.type === "virtual" && !hack.location ? (
          <section className="hd-section">
            <h3 className="hd-section-title">{t("locationTitle")}</h3>
            <p className="hd-about">{t("locationVirtual")}</p>
          </section>
        ) : hack.location ? (
          <section className="hd-section">
            <h3 className="hd-section-title">{t("locationTitle")}</h3>
            <p className="hd-loc-text">
              <Icon name="location" className="ic-sm" /> {hack.location}
            </p>
            {hasCoords && (
              <>
                <div className="hd-map">
                  <iframe
                    title={t("mapTitle")}
                    src={`https://www.google.com/maps?q=${hack.latitude},${hack.longitude}&z=14&output=embed`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
                <a
                  className="hd-map-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="external" className="ic-sm" /> {t("viewOnMaps")}
                </a>
              </>
            )}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}

export default HackathonDetailClient;
