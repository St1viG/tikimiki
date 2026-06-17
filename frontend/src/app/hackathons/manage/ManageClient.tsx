"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { CreateHackathonPopup } from "@/components/popups/CreateHackathonPopup";
import { CalendarPopup } from "@/components/popups/CalendarPopup";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireRole } from "@/components/auth/AuthProvider";

/**
 * ManageClient — interactive admin/org management view for hackathons.
 *
 * Behaviour:
 *  - Tab filter: updates data-filter attribute on the .hk-page element so the
 *    CSS section visibility rules apply (via
 *    `.hk-page[data-filter="X"] .hk-section:not([data-section="X"]){ display:none }`).
 *  - Filter chips: toggle .hk-chip-active per chip.
 *  - Search: filters visible .hk-card / .hk-apply-row / .hk-done-row / .hk-featured
 *    elements by text match.
 *  - Join buttons ("Apply"): on click disable themselves and show "✓ Applied".
 *  - Load-more: on click disables with "No more hackathons" text.
 *  - Create hackathon: opens <CreateHackathonPopup>.
 *  - Calendar dropdown: toggles <CalendarPopup> open/closed.
 *
 * Supplies its own `<main className="hk-page" id="main">`.
 */

const M = {
  back:             { en: "Back",                          sr: "Nazad" },
  pageTitle:        { en: "Hackathons",                    sr: "Hackathoni" },
  pageSub:          { en: "Manage your hackathons and track statistics.", sr: "Upravljaj svojim hackathonima i prati statistiku." },
  tablistLabel:     { en: "Filter hackathons",             sr: "Filter hackathona" },
  tabAll:           { en: "All",                           sr: "Svi" },
  tabActive:        { en: "Active",                        sr: "Aktuelni" },
  tabUpcoming:      { en: "Upcoming",                      sr: "Predstojeći" },
  tabMine:          { en: "My hackathons",                 sr: "Moji hakatoni" },
  tabCompleted:     { en: "Completed",                     sr: "Završeni" },
  createHackathon:  { en: "Create hackathon",              sr: "Kreiraj hackathon" },
  hkSearchLabel:    { en: "Search hackathons",             sr: "Pretraži hackathone" },
  hkSearchPlaceholder:{ en: "Search hackathons…",          sr: "Pretraži hackathone…" },
  sectionLive:      { en: "Currently live",                sr: "Trenutno aktivan" },
  verifiedOrg:      { en: "Verified organizer",            sr: "Verifikovan organizator" },
  remaining:        { en: "remaining",                     sr: "preostalo" },
  metaDuration:     { en: "Duration",                      sr: "Trajanje" },
  metaParticipants: { en: "Participants",                   sr: "Učesnici" },
  metaPrize:        { en: "Main prize",                    sr: "Glavna nagrada" },
  metaDeadline:     { en: "Application deadline",          sr: "Rok za prijavu" },
  calendar:         { en: "Calendar",                      sr: "Kalendar" },
  sectionUpcoming:  { en: "Upcoming hackathons",           sr: "Predstojeći hackathoni" },
  full:             { en: "Full",                          sr: "Popunjeno" },
  typePhysical:     { en: "Physical",                      sr: "Fizički" },
  typeVirtual:      { en: "Virtual",                       sr: "Virtuelni" },
  onlineLoc:        { en: "Online",                        sr: "Online" },
  daysIn:           { en: "in {n} days",                   sr: "za {n} dana" },
  ongoing:          { en: "ongoing",                       sr: "u toku" },
  sectionMine:      { en: "My hackathons",                 sr: "Moji hakatoni" },
  // note: `full` is still used by the HackNight card's disabled state.
  newHackathon:     { en: "New hackathon",                 sr: "Novi hackathon" },
  statusActive:     { en: "Active",                        sr: "Aktivan" },
  participantsOf:   { en: "participants",                  sr: "učesnika" },
  teams:            { en: "teams",                         sr: "timova" },
  statistics:       { en: "Statistics",                    sr: "Statistika" },
  manage:           { en: "Manage",                        sr: "Upravljaj" },
  statusDraft:      { en: "Draft",                         sr: "Nacrt" },
  notPublished:     { en: "not published",                 sr: "nije objavljen" },
  lastEdit:         { en: "last edit",                     sr: "poslednja izmena" },
  preview:          { en: "Preview",                       sr: "Pregledaj" },
  continueEdit:     { en: "Continue editing",              sr: "Nastavi izmene" },
  statusPublished:  { en: "Published",                     sr: "Objavljen" },
  appsOpen:         { en: "applications open",             sr: "prijave otvorene" },
  applications:     { en: "applications",                  sr: "prijave" },
  deadline:         { en: "deadline",                      sr: "rok" },
  viewApps:         { en: "Applications",                  sr: "Prijave" },
  sectionDone:      { en: "Completed hackathons",          sr: "Završeni hackathoni" },
  winner:           { en: "winner",                        sr: "pobednik" },
  footerAbout:      { en: "About us",                      sr: "O nama" },
  footerA11y:       { en: "Accessibility",                 sr: "Pristupačnost" },
  footerHelp:       { en: "Help center",                   sr: "Centar za pomoć" },
  footerPrivacy:    { en: "Privacy & terms",               sr: "Privatnost i uslovi" },
} as const;

type FilterTab = "all" | "active" | "upcoming" | "mine" | "completed";

export function ManageClient() {
  useRequireRole("organization");
  const t = useT(M);

  const [filter, setFilter] = useState<FilterTab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const days = (n: number) => t("daysIn").replace("{n}", String(n));

  const handleCalBtnClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCalOpen((v) => !v);
  };

  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const closeCal = useCallback(() => setCalOpen(false), []);

  // Search filtering: keep all cards rendered and hide them via inline style.
  const isVisible = (text: string) => {
    const q = searchQuery.trim().toLowerCase();
    return !q || text.toLowerCase().includes(q);
  };

  const featuredText =
    "ETF HackWeek 2026 ETF Univerzitet u Beogradu Fizički Beograd ETF AI Web Low level 48h 87/120 $2,000 20.04.2026.";

  // Tab definitions resolved at render time
  const tabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: "all",       label: t("tabAll") },
    { id: "active",    label: t("tabActive") },
    { id: "upcoming",  label: t("tabUpcoming") },
    { id: "mine",      label: t("tabMine"), count: 3 },
    { id: "completed", label: t("tabCompleted") },
  ];

  return (
    <AppShell variant="no-right">
      <main className="hk-page" id="main" data-filter={filter}>
        {/* PAGE HEADER */}
        <div className="page-head">
          <Link className="col-back" href="/" aria-label={t("back")}>
            <Icon name="arrow-left" aria-hidden="true" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="hackathon" aria-hidden="true" /> {t("pageTitle")}
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
          {/* Removed the dead page-head search input (no handler); the wired
              hackathon search lives in the filter bar below. */}
        </div>

        {/* TABS + create action */}
        <div className="tabs-row tabs-row--divided">
          <div className="hk-tabs" role="tablist" aria-label={t("tablistLabel")}>
            {tabs.map(({ id, label, count }) => (
              <button
                key={id}
                className={`hk-tab${filter === id ? " hk-tab-active" : ""}`}
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
                {count !== undefined && (
                  <span className="hk-tab-count">{count}</span>
                )}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary hk-btn-lg hk-admin-create"
            onClick={() => setCreateOpen(true)}
          >
            <Icon name="plus" aria-hidden="true" /> {t("createHackathon")}
          </button>
        </div>

        {/* FILTER BAR */}
        <div className="hk-filter-bar">
          <div className="hk-search" role="search">
            <Icon name="search" aria-hidden="true" />
            <input
              type="search"
              aria-label={t("hkSearchLabel")}
              placeholder={t("hkSearchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {/* Filter chips (Location/Type/Prize/Skills) + "Sort: Newest" removed:
              this view is static demo content with no live dataset to filter or
              sort, so the controls only toggled active styling without effect. */}
        </div>

        {/* FEATURED (LIVE) */}
        <section
          className="hk-section"
          data-section="active"
          style={!isVisible(featuredText) ? { display: "none" } : undefined}
        >
          <div className="hk-section-head">
            <div className="hk-section-title">{t("sectionLive")}</div>
          </div>

          <div className="hk-featured">
            <div className="hk-featured-banner hk-has-img">
              <img
                src="/images/etf2.jpg"
                alt="ETF HackWeek 2026: banner"
                className="hk-banner-img"
                loading="lazy"
              />
              <div className="hk-banner-dim"></div>
              <div className="hk-featured-pills">
                <span className="hk-pill">
                  <Icon name="location" aria-hidden="true" /> Fizički · Beograd, ETF
                </span>
              </div>
            </div>

            <div className="hk-featured-body">
              <div className="hk-featured-top">
                <div className="hk-card-org">
                  <div className="hk-org-av" aria-hidden="true">ETF</div>
                  <span>ETF Univerzitet u Beogradu</span>
                  <span className="hk-verify" title={t("verifiedOrg")}>
                    <Icon name="shield" aria-hidden="true" />
                  </span>
                </div>
                <div className="hk-countdown">
                  <Icon name="clock" aria-hidden="true" /> 23h 41min {t("remaining")}
                </div>
              </div>

              <h2 className="hk-featured-name">ETF HackWeek 2026</h2>

              <div className="hk-featured-tags">
                <span className="tag tag-v">AI</span>
                <span className="tag tag-g">Web</span>
                <span className="tag tag-l">Low level</span>
              </div>

              <div className="hk-featured-meta">
                <div className="hk-meta-item">
                  <div className="hk-meta-label">{t("metaDuration")}</div>
                  <div className="hk-meta-val">48h</div>
                </div>
                <div className="hk-meta-item">
                  <div className="hk-meta-label">{t("metaParticipants")}</div>
                  <div className="hk-meta-val">
                    87<span className="hk-meta-cap">/120</span>
                  </div>
                </div>
                <div className="hk-meta-item">
                  <div className="hk-meta-label">{t("metaPrize")}</div>
                  <div className="hk-meta-val hk-meta-val-prize">$2,000</div>
                </div>
                <div className="hk-meta-item">
                  <div className="hk-meta-label">{t("metaDeadline")}</div>
                  <div className="hk-meta-val">20.04.2026.</div>
                </div>
              </div>

              {/*
                Optimistic-only "Apply" and handler-less "Open page" removed:
                this is the org's own static demo hackathon (no API id / detail
                route), so neither button could be backed. Calendar is kept.
              */}
              <div className="hk-featured-foot">
                <div className="hk-cal-wrap">
                  <button
                    className="btn btn-ghost hk-btn-lg hk-cal-btn"
                    aria-haspopup="true"
                    aria-expanded={calOpen}
                    onClick={handleCalBtnClick}
                  >
                    <Icon name="calendar" aria-hidden="true" /> {t("calendar")}{" "}
                    <Icon name="chevron-down" aria-hidden="true" />
                  </button>
                  <CalendarPopup open={calOpen} onClose={closeCal} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PREDSTOJEĆI */}
        <section
          className="hk-section"
          data-section="upcoming"
        >
          <div className="hk-section-head">
            <div className="hk-section-title">
              <Icon name="calendar" aria-hidden="true" /> {t("sectionUpcoming")}
            </div>
          </div>

          <div className="hk-grid">

            {/* Garaža Winter Jam */}
            <div
              className="hk-card"
              style={
                !isVisible("Garaža Winter Jam 2026 Fizički Novi Sad Rust Embedded €1,200")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-card-banner">
                <span className="hk-type-pill">{t("typePhysical")}</span>
                <span className="hk-card-days">{days(11)}</span>
              </div>
              <div className="hk-card-body">
                <div className="hk-card-org">
                  <div className="hk-org-av hk-org-av-sm" aria-hidden="true">GH</div>
                  <span>Garaža</span>
                  <span className="hk-verify" title={t("verifiedOrg")}>
                    <Icon name="shield" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="hk-card-name">Garaža Winter Jam 2026</h3>
                <div className="hk-card-date">25.04. – 27.04.2026. · Novi Sad</div>
                <div className="hk-card-tags">
                  <span className="tag tag-v">Rust</span>
                  <span className="tag tag-g">Embedded</span>
                </div>
                <div className="hk-card-foot">
                  <div className="hk-prize-inline">
                    <Icon name="trophy" aria-hidden="true" /> €1,200
                  </div>
                </div>
              </div>
            </div>

            {/* AI4Good Belgrade */}
            <div
              className="hk-card"
              style={
                !isVisible("AI4Good Belgrade Virtuelni Online LLM Python $5,000")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-card-banner hk-banner-v">
                <span className="hk-type-pill">{t("typeVirtual")}</span>
                <span className="hk-card-days">{days(18)}</span>
              </div>
              <div className="hk-card-body">
                <div className="hk-card-org">
                  <div className="hk-org-av hk-org-av-sm" aria-hidden="true">A4</div>
                  <span>AI4Good Foundation</span>
                  <span className="hk-verify" title={t("verifiedOrg")}>
                    <Icon name="shield" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="hk-card-name">AI4Good Belgrade</h3>
                <div className="hk-card-date">02.05. – 04.05.2026. · {t("onlineLoc")}</div>
                <div className="hk-card-tags">
                  <span className="tag tag-v">LLM</span>
                  <span className="tag tag-g">Python</span>
                </div>
                <div className="hk-card-foot">
                  <div className="hk-prize-inline">
                    <Icon name="trophy" aria-hidden="true" /> $5,000
                  </div>
                </div>
              </div>
            </div>

            {/* HackNight #7 */}
            <div
              className="hk-card"
              style={
                !isVisible("HackNight #7 Fizički Beograd Web UX €800 Popunjeno")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-card-banner">
                <span className="hk-type-pill">{t("typePhysical")}</span>
                <span className="hk-card-days">{days(26)}</span>
              </div>
              <div className="hk-card-body">
                <div className="hk-card-org">
                  <div className="hk-org-av hk-org-av-sm" aria-hidden="true">HN</div>
                  <span>HackNight.rs</span>
                  <span className="hk-verify" title={t("verifiedOrg")}>
                    <Icon name="shield" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="hk-card-name">HackNight #7</h3>
                <div className="hk-card-date">10.05.2026. · Beograd</div>
                <div className="hk-card-tags">
                  <span className="tag tag-v">Web</span>
                  <span className="tag tag-g">UX</span>
                </div>
                <div className="hk-card-foot">
                  <button className="btn hk-btn-sm hk-btn-disabled" disabled>
                    {t("full")}
                  </button>
                  <div className="hk-prize-inline">
                    <Icon name="trophy" aria-hidden="true" /> €800
                  </div>
                </div>
              </div>
            </div>

            {/* FinTech Sprint */}
            <div
              className="hk-card"
              style={
                !isVisible("FinTech Sprint Virtuelni Online React Node $3,000")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-card-banner hk-banner-v">
                <span className="hk-type-pill">{t("typeVirtual")}</span>
                <span className="hk-card-days">{days(31)}</span>
              </div>
              <div className="hk-card-body">
                <div className="hk-card-org">
                  <div className="hk-org-av hk-org-av-sm" aria-hidden="true">FT</div>
                  <span>FinTech Hub</span>
                  <span className="hk-verify" title={t("verifiedOrg")}>
                    <Icon name="shield" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="hk-card-name">FinTech Sprint</h3>
                <div className="hk-card-date">15.05. – 17.05.2026. · {t("onlineLoc")}</div>
                <div className="hk-card-tags">
                  <span className="tag tag-v">React</span>
                  <span className="tag tag-g">Node</span>
                </div>
                <div className="hk-card-foot">
                  <div className="hk-prize-inline">
                    <Icon name="trophy" aria-hidden="true" /> $3,000
                  </div>
                </div>
              </div>
            </div>

            {/* Niš TechStorm */}
            <div
              className="hk-card"
              style={
                !isVisible("Niš TechStorm 2026 Fizički Niš IoT Green €4,500")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-card-banner">
                <span className="hk-type-pill">{t("typePhysical")}</span>
                <span className="hk-card-days">{days(36)}</span>
              </div>
              <div className="hk-card-body">
                <div className="hk-card-org">
                  <div className="hk-org-av hk-org-av-sm" aria-hidden="true">NT</div>
                  <span>Niš TechPark</span>
                  <span className="hk-verify" title={t("verifiedOrg")}>
                    <Icon name="shield" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="hk-card-name">Niš TechStorm 2026</h3>
                <div className="hk-card-date">20.05. – 22.05.2026. · Niš</div>
                <div className="hk-card-tags">
                  <span className="tag tag-v">IoT</span>
                  <span className="tag tag-g">Green</span>
                </div>
                <div className="hk-card-foot">
                  <div className="hk-prize-inline">
                    <Icon name="trophy" aria-hidden="true" /> €4,500
                  </div>
                </div>
              </div>
            </div>

            {/* Startit Pitch Weekend */}
            <div
              className="hk-card"
              style={
                !isVisible("Startit Pitch Weekend Virtuelni Online Any stack Pitch €2,500")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-card-banner hk-banner-v">
                <span className="hk-type-pill">{t("typeVirtual")}</span>
                <span className="hk-card-days">{days(44)}</span>
              </div>
              <div className="hk-card-body">
                <div className="hk-card-org">
                  <div className="hk-org-av hk-org-av-sm" aria-hidden="true">ST</div>
                  <span>Startit</span>
                  <span className="hk-verify" title={t("verifiedOrg")}>
                    <Icon name="shield" aria-hidden="true" />
                  </span>
                </div>
                <h3 className="hk-card-name">Startit Pitch Weekend</h3>
                <div className="hk-card-date">28.05. – 30.05.2026. · {t("onlineLoc")}</div>
                <div className="hk-card-tags">
                  <span className="tag tag-v">Any stack</span>
                  <span className="tag tag-g">Pitch</span>
                </div>
                <div className="hk-card-foot">
                  <div className="hk-prize-inline">
                    <Icon name="trophy" aria-hidden="true" /> €2,500
                  </div>
                </div>
              </div>
            </div>

          </div>
          {/* Load-more removed: all demo cards already render; the button only
              flipped to "No more hackathons" without loading anything. The
              optimistic-only "Apply" buttons on these unbacked demo cards were
              also removed (no hackathonId to drive the real apply flow). */}
        </section>

        {/* MOJI HAKATONI (admin-owned) */}
        <section
          className="hk-section"
          data-section="mine"
        >
          <div className="hk-section-head">
            <div className="hk-section-title">
              <Icon name="shield" aria-hidden="true" /> {t("sectionMine")}
            </div>
            <button
              className="btn btn-violet hk-btn-sm hk-admin-create"
              onClick={() => setCreateOpen(true)}
            >
              <Icon name="plus" aria-hidden="true" /> {t("newHackathon")}
            </button>
          </div>

          <div className="hk-apply-list">

            <div
              className="hk-apply-row"
              style={
                !isVisible("ETF HackWeek 2026 Aktivan 87/120 učesnika 12 timova")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-apply-status hk-apply-approved">
                <Icon name="check" aria-hidden="true" /> {t("statusActive")}
              </div>
              <div className="hk-apply-info">
                <div className="hk-apply-name">ETF HackWeek 2026</div>
                <div className="hk-apply-meta">
                  {t("ongoing")} · <strong>87/120</strong> {t("participantsOf")} · <strong>12</strong> {t("teams")}
                </div>
              </div>
              <button className="btn btn-ghost hk-btn-sm">{t("statistics")}</button>
              <Link className="btn btn-primary hk-btn-sm" href="/applications">
                {t("manage")}
              </Link>
            </div>

            <div
              className="hk-apply-row"
              style={
                !isVisible("ETF Summer Code 2026 Nacrt nije objavljen 12.04.2026.")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-apply-status hk-apply-pending">
                <Icon name="clock" aria-hidden="true" /> {t("statusDraft")}
              </div>
              <div className="hk-apply-info">
                <div className="hk-apply-name">ETF Summer Code 2026</div>
                <div className="hk-apply-meta">
                  {t("notPublished")} · {t("lastEdit")} 12.04.2026.
                </div>
              </div>
              <button className="btn btn-ghost hk-btn-sm">{t("preview")}</button>
              <button className="btn btn-primary hk-btn-sm">{t("continueEdit")}</button>
            </div>

            <div
              className="hk-apply-row"
              style={
                !isVisible("ETF Autumn Sprint 2026 Objavljen 34 prijave 10.10.2026.")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-apply-status hk-apply-approved">
                <Icon name="check" aria-hidden="true" /> {t("statusPublished")}
              </div>
              <div className="hk-apply-info">
                <div className="hk-apply-name">ETF Autumn Sprint 2026</div>
                <div className="hk-apply-meta">
                  {t("appsOpen")} · <strong>34</strong> {t("applications")} · {t("deadline")} 10.10.2026.
                </div>
              </div>
              <Link className="btn btn-ghost hk-btn-sm" href="/applications">
                {t("viewApps")}
              </Link>
              <Link className="btn btn-primary hk-btn-sm" href="/applications">
                {t("manage")}
              </Link>
            </div>

          </div>
        </section>

        {/* ZAVRŠENI */}
        <section
          className="hk-section"
          data-section="completed"
        >
          <div className="hk-section-head">
            <div className="hk-section-title">
              <Icon name="trophy" aria-hidden="true" /> {t("sectionDone")}
            </div>
          </div>

          <div className="hk-done-list">

            <div
              className="hk-done-row"
              style={
                !isVisible("ETF HackWeek 2025 04.04. 06.04.2025. tiki&miki $2,000")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-done-rank">
                <Icon name="teams" aria-hidden="true" /> 142
              </div>
              <div className="hk-done-info">
                <div className="hk-done-name">ETF HackWeek 2025</div>
                <div className="hk-done-meta">
                  04.04. – 06.04.2025. · {t("winner")} <strong>tiki&amp;miki</strong>
                </div>
              </div>
              <div className="hk-done-prize">
                <Icon name="trophy" aria-hidden="true" /> $2,000
              </div>
            </div>

            <div
              className="hk-done-row"
              style={
                !isVisible("ETF Winter Jam 2024 12.12. 14.12.2024. nonade €1,200")
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="hk-done-rank">
                <Icon name="teams" aria-hidden="true" /> 78
              </div>
              <div className="hk-done-info">
                <div className="hk-done-name">ETF Winter Jam 2024</div>
                <div className="hk-done-meta">
                  12.12. – 14.12.2024. · {t("winner")} <strong>nonade</strong>
                </div>
              </div>
              <div className="hk-done-prize">
                <Icon name="trophy" aria-hidden="true" /> €1,200
              </div>
            </div>

          </div>
        </section>

        <footer className="mini" style={{ textAlign: "center", marginTop: "8px" }}>
          <a href="#">{t("footerAbout")}</a> · <a href="#">{t("footerA11y")}</a> ·{" "}
          <a href="#">{t("footerHelp")}</a> · <a href="#">{t("footerPrivacy")}</a>
          <br />
          <span className="cw">
            <b>tiki</b>miki
          </span>{" "}
          © 2026
        </footer>

        {/* Popups */}
        <CreateHackathonPopup open={createOpen} onClose={closeCreate} />
      </main>
    </AppShell>
  );
}

export default ManageClient;
