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
  getHackathon,
  getMyApplications,
  type Application,
} from "@/lib/api";

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
  back:            { en: "Hackathons",                  sr: "Hackathoni" },
  pageTitle:       { en: "Hackathon",                   sr: "Hackathon" },

  notFound:        { en: "Hackathon not found.",        sr: "Hackathon nije pronađen." },
  browse:          { en: "Browse hackathons",           sr: "Pregledaj hackathone" },

  by:              { en: "by",                          sr: "organizuje" },
  verifiedOrg:     { en: "Verified organizer",          sr: "Verifikovan organizator" },

  statusUpcoming:  { en: "Upcoming",                    sr: "Predstojeći" },
  statusLive:      { en: "Live now",                    sr: "U toku" },
  statusFinished:  { en: "Finished",                    sr: "Završen" },
  statusCancelled: { en: "Cancelled",                   sr: "Otkazan" },

  // Meta
  metaWhen:        { en: "When",                        sr: "Kada" },
  metaParticipants:{ en: "Participants",                sr: "Učesnici" },
  metaTeams:       { en: "Teams",                       sr: "Timovi" },
  metaPrize:       { en: "Main prize",                  sr: "Glavna nagrada" },
  metaDeadline:    { en: "Apply by",                    sr: "Rok za prijavu" },
  addToCalendar:   { en: "Add to calendar",             sr: "Dodaj u kalendar" },

  // Sections
  aboutTitle:      { en: "About",                       sr: "O hackathonu" },
  locationTitle:   { en: "Location",                    sr: "Lokacija" },
  locationVirtual: { en: "This is a virtual hackathon — it takes place online.", sr: "Ovo je virtuelni hackathon — održava se online." },
  viewOnMaps:      { en: "View on Google Maps",         sr: "Otvori u Google Maps" },
  mapTitle:        { en: "Hackathon location map",      sr: "Mapa lokacije hackathona" },

  // CTA
  ctaApply:        { en: "Apply to this hackathon",     sr: "Prijavi se na ovaj hackathon" },
  ctaSignIn:       { en: "Sign in to apply",            sr: "Prijavi se da konkurišeš" },
  signIn:          { en: "Sign in",                     sr: "Prijava" },
  ctaApplied:      { en: "You've applied",              sr: "Već si se prijavio" },
  viewApplication: { en: "View application",            sr: "Pogledaj prijavu" },
  ctaOwn:          { en: "This is your hackathon.",     sr: "Ovo je tvoj hackathon." },
  manageApps:      { en: "Manage applications",         sr: "Upravljaj prijavama" },
  editHackathon:   { en: "Edit",                        sr: "Izmeni" },
  deadlinePassed:  { en: "Applications are closed.",    sr: "Prijave su zatvorene." },

  statusPending:   { en: "Pending review",              sr: "Na čekanju" },
  statusApproved:  { en: "Approved",                    sr: "Odobreno" },
  statusRejected:  { en: "Rejected",                    sr: "Odbijeno" },
  statusWaitlisted:{ en: "Waitlisted",                  sr: "Lista čekanja" },

  typePhysical:    { en: "Physical",                    sr: "Fizički" },
  typeVirtual:     { en: "Virtual",                     sr: "Virtuelni" },
  typeHybrid:      { en: "Hybrid",                      sr: "Hibridni" },
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

  useEffect(() => {
    let cancelled = false;
    getHackathon(hackathonId)
      .then((h) => !cancelled && setHack(h))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

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
              <span className="skel skel-line" style={{ width: "70%", height: 28, marginTop: 12 }} />
              <span className="skel skel-line" style={{ width: "55%", height: 13, marginTop: 14 }} />
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
  const canApply =
    !isOwner && hack.status === "upcoming" && !deadlinePassed && !existing;

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
              <div className="hd-org-av" aria-hidden="true">{initials(hack.organizationName)}</div>
              <span className="hd-org-name">
                {t("by")} <strong>{hack.organizationName}</strong>
              </span>
              <span className="hk-verify" title={t("verifiedOrg")}>
                <Icon name="shield" />
              </span>
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
              />
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div className="hd-meta">
          <div className="hd-meta-item">
            <div className="hd-meta-label"><Icon name="calendar" /> {t("metaWhen")}</div>
            <div className="hd-meta-val">{dateRange(hack.startsAt, hack.endsAt)}</div>
          </div>
          <div className="hd-meta-item">
            <div className="hd-meta-label"><Icon name="teams" /> {t("metaParticipants")}</div>
            <div className="hd-meta-val">
              {hack.participantCount}
              {hack.maxParticipants !== null && (
                <span className="hd-meta-cap">/{hack.maxParticipants}</span>
              )}
            </div>
          </div>
          <div className="hd-meta-item">
            <div className="hd-meta-label"><Icon name="flag" /> {t("metaTeams")}</div>
            <div className="hd-meta-val">{hack.teamCount}</div>
          </div>
          {hack.prizePool && (
            <div className="hd-meta-item">
              <div className="hd-meta-label"><Icon name="trophy" /> {t("metaPrize")}</div>
              <div className="hd-meta-val hd-meta-prize">{hack.prizePool}</div>
            </div>
          )}
          <div className="hd-meta-item">
            <div className="hd-meta-label"><Icon name="clock" /> {t("metaDeadline")}</div>
            <div className="hd-meta-val">{fmtDMY(new Date(hack.registrationDeadline))}</div>
          </div>
        </div>

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

        {/* Apply CTA */}
        <div className="hd-cta">
          {isOwner ? (
            <div className="hd-cta-own">
              <span>{t("ctaOwn")}</span>
              <Link
                className="btn btn-primary"
                href={`/hackathons/${hack.hackathonId}/edit`}
              >
                <Icon name="settings" /> {t("editHackathon")}
              </Link>
              <Link className="btn btn-ghost" href="/applications">
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
            <Link className="btn btn-primary hd-cta-btn" href={`/hackathons/${hack.hackathonId}/apply`}>
              <Icon name="flag" /> {t("ctaApply")}
            </Link>
          ) : (
            <p className="hd-cta-closed">{t("deadlinePassed")}</p>
          )}
        </div>
      </main>
    </AppShell>
  );
}

export default HackathonDetailClient;
