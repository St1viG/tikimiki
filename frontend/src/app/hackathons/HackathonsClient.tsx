"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { HackathonSummary, HackathonType } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { getHackathons, getMyApplications, type Application } from "@/lib/api";
import { initials } from "@/lib/format";

/**
 * HackathonsClient — fully data-driven hackathons page.
 *
 * Every section is sourced from GET /api/v1/hackathons (+ GET /applications/me
 * for the signed-in viewer). Nothing is hardcoded: a field is only rendered when
 * the backend supplies a non-null value.
 *
 *  - Live: hackathons with status "ongoing" (live countdown from endsAt).
 *  - Upcoming: status "upcoming", with search / type-filter / sort; Apply
 *    navigates to /hackathons/:id/apply, or shows the applied status if the
 *    viewer already applied.
 *  - My applications: real rows from GET /applications/me (signed-in only).
 *  - Completed: status "finished".
 *  - Organizations see a prominent "Organize a hackathon" → /hackathons/new.
 *
 * Supplies its own `<main className="hk-page" id="hk-main">`.
 */

const M = {
  back:            { en: "Back",                   sr: "Nazad" },
  pageTitle:       { en: "Hackathons",             sr: "Hackathoni" },
  pageSub:         { en: "Find your next hackathon.", sr: "Pronađi svoj naredni hackathon." },
  organize:        { en: "Organize a hackathon",   sr: "Organizuj hackathon" },
  tabAll:          { en: "All",                    sr: "Svi" },
  tabYour:         { en: "Your",                   sr: "Tvoji" },
  tablistLabel:    { en: "Filter hackathons",      sr: "Filter hackathona" },
  searchLabel:     { en: "Search hackathons",      sr: "Pretraži hackathone" },
  searchPlaceholder: { en: "Search hackathons…",   sr: "Pretraži hackathone…" },
  chipType:        { en: "Type",                   sr: "Tip" },
  typePhysical:    { en: "Physical",               sr: "Fizički" },
  typeVirtual:     { en: "Virtual",                sr: "Virtuelni" },
  typeHybrid:      { en: "Hybrid",                 sr: "Hibridni" },
  sortLabel:       { en: "Sort: ",                 sr: "Sortiraj: " },
  sortNewest:      { en: "Newest",                 sr: "Najskoriji" },
  sortSoonest:     { en: "Starting soon",          sr: "Najskorije počinje" },
  daysSoon:        { en: "soon",                   sr: "uskoro" },
  daysOneDay:      { en: "in 1 day",               sr: "za 1 dan" },
  daysNDays:       { en: "in {n} days",            sr: "za {n} dana" },
  sectionLive:     { en: "Currently live",         sr: "Trenutno aktivan" },
  verifiedOrg:     { en: "Verified organizer",     sr: "Verifikovan organizator" },
  remaining:       { en: "remaining",              sr: "preostalo" },
  ended:           { en: "ended",                  sr: "završeno" },
  metaParticipants:{ en: "Participants",            sr: "Učesnici" },
  metaTeams:       { en: "Teams",                  sr: "Timovi" },
  metaPrize:       { en: "Main prize",             sr: "Glavna nagrada" },
  metaDeadline:    { en: "Application deadline",   sr: "Rok za prijavu" },
  applied:         { en: "Applied",                sr: "Prijavljen" },
  apply:           { en: "Apply",                  sr: "Prijavi se" },
  sectionUpcoming: { en: "Upcoming hackathons",    sr: "Predstojeći hackathoni" },
  sectionApps:     { en: "My applications",        sr: "Moje prijave" },
  statusPending:   { en: "Pending",                sr: "Na čekanju" },
  statusApproved:  { en: "Approved",               sr: "Odobren" },
  statusRejected:  { en: "Rejected",               sr: "Odbijen" },
  statusWaitlisted:{ en: "Waitlisted",             sr: "Lista čekanja" },
  appTeam:         { en: "team",                   sr: "tim" },
  appSolo:         { en: "solo",                   sr: "pojedinačno" },
  viewApp:         { en: "View hackathon",         sr: "Pogledaj hackathon" },
  sectionDone:     { en: "Completed hackathons",   sr: "Završeni hackathoni" },
  empty:           { en: "No hackathons yet.",     sr: "Još nema hackathona." },
  loadError:       { en: "Couldn't load hackathons.", sr: "Greška pri učitavanju hackathona." },
  yourAnon:        { en: "Sign in to see the hackathons you've applied to.", sr: "Prijavi se da vidiš hackathone na koje si se prijavio." },
  yourEmpty:       { en: "You haven't applied to any hackathons yet.", sr: "Još se nisi prijavio ni na jedan hackathon." },
  signIn:          { en: "Sign in",                sr: "Prijava" },
} as const;

type HkFilter = "all" | "your";
type TypeFilter = "all" | HackathonType;
type SortMode = "newest" | "soonest";

/* small display helpers */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDM(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}
function fmtDMY(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
}
function dateRange(aIso: string, bIso: string): string {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (a.toDateString() === b.toDateString()) return fmtDMY(a);
  return `${fmtDM(a)} – ${fmtDMY(b)}`;
}
function daysUntilCount(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Format the live ms-remaining as a compact "Dd Hh Mm" / "Hh Mm" countdown. */
function fmtCountdown(msLeft: number): string {
  if (msLeft <= 0) return "";
  const totalMin = Math.floor(msLeft / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}min`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}

export function HackathonsClient() {
  const t = useT(M);
  const { user } = useAuth();

  const typeLabel = (type: HackathonType): string =>
    type === "virtual" ? t("typeVirtual") : type === "hybrid" ? t("typeHybrid") : t("typePhysical");
  const daysUntil = (iso: string): string => {
    const d = daysUntilCount(iso);
    if (d <= 0) return t("daysSoon");
    if (d === 1) return t("daysOneDay");
    return t("daysNDays").replace("{n}", String(d));
  };
  const searchText = (h: HackathonSummary): string =>
    `${h.title} ${typeLabel(h.type)} ${h.location ?? ""} ${h.theme ?? ""} ${h.organizationName}`;

  const [filter, setFilter] = useState<HkFilter>("all");
  const [searchQ, setSearchQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  // Live hackathon data (all sections derive from this single fetch).
  const [hacks, setHacks] = useState<HackathonSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // The signed-in viewer's applications (null until loaded / anon).
  const [apps, setApps] = useState<Application[] | null>(null);

  // A live "now" tick so the ongoing-countdown re-renders each minute.
  const [now, setNow] = useState(() => Date.now());
  const nowRef = useRef(now);
  nowRef.current = now;

  // Cycle the Type chip: all → physical → virtual → hybrid → all
  const TYPE_CYCLE: TypeFilter[] = ["all", "physical", "virtual", "hybrid"];
  const cycleType = () =>
    setTypeFilter((cur) => TYPE_CYCLE[(TYPE_CYCLE.indexOf(cur) + 1) % TYPE_CYCLE.length]);
  const typeChipLabel = typeFilter === "all" ? t("chipType") : typeLabel(typeFilter);

  useEffect(() => {
    let cancelled = false;
    getHackathons()
      .then((data) => {
        if (!cancelled) setHacks(data);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setHacks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the viewer's applications when signed in (clear when signed out).
  useEffect(() => {
    if (!user) {
      setApps(null);
      return;
    }
    let cancelled = false;
    getMyApplications()
      .then((data) => {
        if (!cancelled) setApps(data);
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Tick the live countdown once a minute (only matters while a live section shows).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Text search: hide cards/rows that don't match
  const q = searchQ.trim().toLowerCase();
  const hidden = (text: string) => q !== "" && !text.toLowerCase().includes(q);

  const all = hacks ?? [];
  const liveHacks = all.filter((h) => h.status === "ongoing");
  const finishedHacks = all.filter((h) => h.status === "finished");

  // Upcoming grid: status "upcoming" + Type filter + Sort.
  const upcomingHacks = all
    .filter((h) => h.status === "upcoming")
    .filter((h) => typeFilter === "all" || h.type === typeFilter)
    .slice()
    .sort((a, b) =>
      sortMode === "newest"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

  // Hackathon ids the viewer already applied to (for "Applied" state on cards).
  const appliedIds = new Set((apps ?? []).map((a) => a.hackathonId));

  const statusLabel = (status: string): string =>
    status === "approved"
      ? t("statusApproved")
      : status === "rejected"
        ? t("statusRejected")
        : status === "waitlisted"
          ? t("statusWaitlisted")
          : t("statusPending");
  const statusClass = (status: string): string =>
    status === "approved"
      ? "hk-apply-approved"
      : status === "rejected"
        ? "hk-apply-rejected"
        : status === "waitlisted"
          ? "hk-apply-waitlisted"
          : "hk-apply-pending";
  const statusIcon = (status: string): string =>
    status === "approved" ? "check" : status === "rejected" ? "x" : "clock";

  return (
    <AppShell right={<RailRight />}>
      <main className="hk-page" id="hk-main" data-filter={filter}>

        {/* PAGE HEADER */}
        <header className="page-head hk-head">
          <Link className="col-back" href="/" aria-label={t("back")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title"><Icon name="hackathon" /> {t("pageTitle")}</h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
          {user?.roles.isOrganization && (
            <Link className="btn btn-primary hk-btn-lg hk-organize-btn" href="/hackathons/new">
              <Icon name="plus" /> {t("organize")}
            </Link>
          )}
        </header>

        {/* TABS */}
        <div className="tabs-row tabs-row--divided">
          <div className="hk-tabs" role="tablist" aria-label={t("tablistLabel")}>
            <button
              className={`hk-tab${filter === "all" ? " hk-tab-active" : ""}`}
              data-filter="all"
              role="tab"
              aria-selected={filter === "all"}
              onClick={() => setFilter("all")}
            >
              {t("tabAll")}
            </button>
            <button
              className={`hk-tab${filter === "your" ? " hk-tab-active" : ""}`}
              data-filter="your"
              role="tab"
              aria-selected={filter === "your"}
              onClick={() => setFilter("your")}
            >
              {t("tabYour")}
            </button>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="hk-filter-bar">
          <div className="hk-search" role="search">
            <Icon name="search" />
            <input
              type="search"
              aria-label={t("searchLabel")}
              placeholder={t("searchPlaceholder")}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
          <div className="hk-chips-row">
            {/* Type filter — cycles all → physical → virtual → hybrid over the grid */}
            <button
              className={`hk-chip${typeFilter !== "all" ? " hk-chip-active" : ""}`}
              aria-pressed={typeFilter !== "all"}
              onClick={cycleType}
            >
              {typeChipLabel} <Icon name="chevron-down" />
            </button>
            {/* Sort — toggles Newest ⇄ Starting soon over the grid */}
            <button
              className="hk-chip-sort hk-chip"
              onClick={() =>
                setSortMode((m) => (m === "newest" ? "soonest" : "newest"))
              }
            >
              {t("sortLabel")}
              <strong>{sortMode === "newest" ? t("sortNewest") : t("sortSoonest")}</strong>{" "}
              <Icon name="chevron-down" className="ic-sm" />
            </button>
          </div>
        </div>

        {/* CURRENTLY LIVE — section active (ongoing hackathons) */}
        {liveHacks.length > 0 && (
          <section className="hk-section" data-section="active">
            <div className="hk-section-head">
              <div className="hk-section-title">
                <span className="hk-live-dot hk-live-dot-lg" aria-hidden="true" /> {t("sectionLive")}
              </div>
            </div>

            {liveHacks.map((h) => {
              if (hidden(searchText(h))) return null;
              const msLeft = new Date(h.endsAt).getTime() - now;
              const countdown = fmtCountdown(msLeft);
              return (
                <div className="hk-featured" key={h.hackathonId}>
                  {h.bannerUrl && (
                    <div className="hk-featured-banner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={h.bannerUrl}
                        alt=""
                        className="hk-banner-img"
                        loading="lazy"
                      />
                      <div className="hk-banner-dim" aria-hidden="true" />
                      <div className="hk-featured-pills">
                        <span className="hk-pill">{typeLabel(h.type)}</span>
                      </div>
                    </div>
                  )}

                  <div className="hk-featured-body">
                    <div className="hk-featured-top">
                      <div className="hk-card-org">
                        <div className="hk-org-av" aria-hidden="true">{initials(h.organizationName)}</div>
                        <span>{h.organizationName}</span>
                        <span className="hk-verify" title={t("verifiedOrg")}>
                          <Icon name="shield" />
                        </span>
                      </div>
                      {countdown && (
                        <div className="hk-countdown">
                          <Icon name="clock" /> {countdown} {t("remaining")}
                        </div>
                      )}
                    </div>

                    <h2 className="hk-featured-name">
                      <Link href={`/hackathons/${h.hackathonId}`}>{h.title}</Link>
                    </h2>

                    {h.theme && (
                      <div className="hk-featured-tags">
                        <span className="tag tag-v">{h.theme}</span>
                      </div>
                    )}

                    {h.location && (
                      <div className="hk-featured-loc">
                        <Icon name="location" className="ic-sm" /> {h.location}
                      </div>
                    )}

                    <div className="hk-featured-meta">
                      <div className="hk-meta-item">
                        <div className="hk-meta-label">{t("metaParticipants")}</div>
                        <div className="hk-meta-val">
                          {h.participantCount}
                          {h.maxParticipants !== null && (
                            <span className="hk-meta-cap">/{h.maxParticipants}</span>
                          )}
                        </div>
                      </div>
                      <div className="hk-meta-item">
                        <div className="hk-meta-label">{t("metaTeams")}</div>
                        <div className="hk-meta-val">{h.teamCount}</div>
                      </div>
                      {h.prizePool && (
                        <div className="hk-meta-item">
                          <div className="hk-meta-label">{t("metaPrize")}</div>
                          <div className="hk-meta-val hk-meta-val-prize">{h.prizePool}</div>
                        </div>
                      )}
                      <div className="hk-meta-item">
                        <div className="hk-meta-label">{t("metaDeadline")}</div>
                        <div className="hk-meta-val">{fmtDMY(new Date(h.registrationDeadline))}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* UPCOMING — section upcoming (data-driven) */}
        <section className="hk-section" data-section="upcoming">
          <div className="hk-section-head">
            <div className="hk-section-title">
              <Icon name="calendar" /> {t("sectionUpcoming")}
            </div>
          </div>

          <div className="hk-grid">
            {hacks === null &&
              [0, 1, 2].map((i) => (
                <div className="hk-card" key={`skel-${i}`} aria-busy="true">
                  <div className="hk-card-banner" aria-hidden="true">
                    <span
                      className="skel"
                      style={{ width: 54, height: 18, borderRadius: 999 }}
                    />
                    <span
                      className="skel"
                      style={{ width: 46, height: 18, borderRadius: 999 }}
                    />
                  </div>
                  <div className="hk-card-body" aria-hidden="true">
                    <div className="hk-card-org">
                      <span
                        className="skel"
                        style={{ width: 30, height: 30, borderRadius: 11 }}
                      />
                      <span className="skel skel-line" style={{ width: "45%" }} />
                    </div>
                    <span className="skel skel-line" style={{ width: "55%" }} />
                    <span className="skel skel-line" style={{ width: "40%" }} />
                    <div className="hk-card-tags">
                      <span
                        className="skel"
                        style={{ width: 52, height: 20, borderRadius: 999 }}
                      />
                    </div>
                    <div className="hk-card-foot">
                      <span
                        className="skel"
                        style={{ width: 82, height: 30, borderRadius: 9 }}
                      />
                      <span className="skel skel-line" style={{ width: "30%" }} />
                    </div>
                  </div>
                </div>
              ))}
            {hacks !== null && upcomingHacks.length === 0 && (
              <p style={{ color: "var(--muted)", padding: "1rem" }}>
                {loadError ? t("loadError") : t("empty")}
              </p>
            )}
            {upcomingHacks.map((h) => (
              <div
                key={h.hackathonId}
                className="hk-card"
                style={hidden(searchText(h)) ? { display: "none" } : undefined}
              >
                <div
                  className={
                    h.type === "virtual"
                      ? "hk-card-banner hk-banner-v"
                      : "hk-card-banner"
                  }
                >
                  <span className="hk-type-pill">{typeLabel(h.type)}</span>
                  <span className="hk-card-days">{daysUntil(h.startsAt)}</span>
                </div>
                <div className="hk-card-body">
                  <div className="hk-card-org">
                    <div className="hk-org-av hk-org-av-sm" aria-hidden="true">
                      {initials(h.organizationName)}
                    </div>
                    <span>{h.organizationName}</span>
                    <span className="hk-verify" title={t("verifiedOrg")}>
                      <Icon name="shield" />
                    </span>
                  </div>
                  <h3 className="hk-card-name">
                    <Link href={`/hackathons/${h.hackathonId}`}>{h.title}</Link>
                  </h3>
                  <div className="hk-card-date">
                    {dateRange(h.startsAt, h.endsAt)}
                    {h.location ? ` · ${h.location}` : ""}
                  </div>
                  {h.theme && (
                    <div className="hk-card-tags">
                      <span className="tag tag-v">{h.theme}</span>
                    </div>
                  )}
                  <div className="hk-card-foot">
                    {appliedIds.has(h.hackathonId) ? (
                      <span className="hk-status-pill hk-status-pending">
                        <Icon name="check" /> {t("applied")}
                      </span>
                    ) : (
                      <Link
                        className="btn btn-primary hk-btn-sm btn-join"
                        href={`/hackathons/${h.hackathonId}/apply`}
                      >
                        {t("apply")}
                      </Link>
                    )}
                    {h.maxParticipants !== null && (
                      <div className="hk-prize-inline">
                        <Icon name="teams" /> {h.participantCount}/{h.maxParticipants}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* YOUR HACKATHONS — section applications (applied + accepted). Always
            rendered so the "Your" tab has content; CSS hides it under "All". */}
        <section className="hk-section" data-section="applications">
          <div className="hk-section-head">
            <div className="hk-section-title">
              <Icon name="flag" /> {t("sectionApps")}
            </div>
          </div>

          {!user ? (
            <p className="hk-empty-note">
              {t("yourAnon")}{" "}
              <Link className="hk-inline-link" href="/login">
                {t("signIn")}
              </Link>
            </p>
          ) : apps === null ? (
            <div className="hk-apply-list" aria-busy="true">
              <span className="skel skel-line" style={{ height: 56, borderRadius: 12 }} />
            </div>
          ) : apps.length === 0 ? (
            <p className="hk-empty-note">{t("yourEmpty")}</p>
          ) : (
            <div className="hk-apply-list">
              {apps.map((a) => (
                <div
                  key={a.applicationId}
                  className="hk-apply-row"
                  style={
                    hidden(`${a.hackathonTitle} ${a.teamName ?? ""}`)
                      ? { display: "none" }
                      : undefined
                  }
                >
                  <div className={`hk-apply-status ${statusClass(a.status)}`}>
                    <Icon name={statusIcon(a.status)} /> {statusLabel(a.status)}
                  </div>
                  <div className="hk-apply-info">
                    <div className="hk-apply-name">{a.hackathonTitle}</div>
                    <div className="hk-apply-meta">
                      {a.teamName ? (
                        <>
                          {t("appTeam")} <strong>{a.teamName}</strong>
                        </>
                      ) : (
                        t("appSolo")
                      )}
                    </div>
                  </div>
                  <Link
                    className="btn btn-ghost hk-btn-sm"
                    href={`/hackathons/${a.hackathonId}/apply`}
                  >
                    {t("viewApp")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* COMPLETED — section completed (status finished) */}
        {finishedHacks.length > 0 && (
          <section className="hk-section" data-section="completed">
            <div className="hk-section-head">
              <div className="hk-section-title">
                <Icon name="trophy" /> {t("sectionDone")}
              </div>
            </div>

            <div className="hk-done-list">
              {finishedHacks.map((h) => (
                <div
                  key={h.hackathonId}
                  className="hk-done-row"
                  style={hidden(searchText(h)) ? { display: "none" } : undefined}
                >
                  <div className="hk-done-rank">
                    <Icon name="trophy" />
                  </div>
                  <div className="hk-done-info">
                    <div className="hk-done-name">
                      <Link href={`/hackathons/${h.hackathonId}`}>{h.title}</Link>
                    </div>
                    <div className="hk-done-meta">
                      {dateRange(h.startsAt, h.endsAt)}
                      {h.location ? ` · ${h.location}` : ""} · {h.organizationName}
                    </div>
                  </div>
                  {h.prizePool && (
                    <div className="hk-done-prize">
                      <Icon name="trophy" /> {h.prizePool}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </AppShell>
  );
}

export default HackathonsClient;
