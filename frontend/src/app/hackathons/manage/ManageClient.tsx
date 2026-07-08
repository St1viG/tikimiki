"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HackathonSummary } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireRole } from "@/components/auth/AuthProvider";
import {
  ApiError,
  deleteHackathonDraft,
  getHackathonDrafts,
  getMyHackathons,
  type HackathonDraft,
} from "@/lib/api";

/**
 * ManageClient — the organizer's "My hackathons" hub (route "/hackathons/manage").
 *
 * Data-driven: lists the org's saved drafts (resume/delete) and its published
 * hackathons (view / edit / applications), from GET /hackathons/drafts and
 * GET /hackathons/mine. Organization accounts only.
 */

const M = {
  back:            { en: "Back",                       sr: "Nazad" },
  pageTitle:       { en: "My hackathons",              sr: "Moji hakatoni" },
  pageSub:         { en: "Drafts, published hackathons and applications.", sr: "Nacrti, objavljeni hakatoni i prijave." },
  create:          { en: "Create hackathon",           sr: "Kreiraj hackathon" },
  loading:         { en: "Loading…",                   sr: "Učitavanje…" },
  loadFailed:      { en: "Couldn't load your hackathons.", sr: "Učitavanje nije uspelo." },

  draftsTitle:     { en: "Drafts",                     sr: "Nacrti" },
  draftUntitled:   { en: "Untitled draft",             sr: "Neimenovani nacrt" },
  lastEdited:      { en: "last edited",                sr: "poslednja izmena" },
  continueEdit:    { en: "Continue editing",           sr: "Nastavi izmene" },
  discard:         { en: "Discard",                    sr: "Odbaci" },
  confirmDiscard:  { en: "Discard this draft? This cannot be undone.", sr: "Odbaciti ovaj nacrt? Ovo se ne može poništiti." },

  publishedTitle:  { en: "Published",                  sr: "Objavljeni" },
  noHackathons:    { en: "You haven't organized any hackathons yet.", sr: "Još nisi organizovao nijedan hakaton." },
  participants:    { en: "participants",               sr: "učesnika" },
  teams:           { en: "teams",                      sr: "timova" },
  view:            { en: "View",                       sr: "Pogledaj" },
  edit:            { en: "Edit",                       sr: "Izmeni" },
  applications:    { en: "Applications",               sr: "Prijave" },

  statusUpcoming:  { en: "Upcoming",                   sr: "Predstojeći" },
  statusLive:      { en: "Live",                       sr: "U toku" },
  statusFinished:  { en: "Finished",                   sr: "Završen" },
  statusCancelled: { en: "Cancelled",                  sr: "Otkazan" },
} as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}.`;
}

/** Best-effort title from a draft's saved form payload. */
function draftTitle(d: HackathonDraft): string {
  const form = (d.payload as { form?: { title?: unknown } }).form;
  const title = typeof form?.title === "string" ? form.title.trim() : "";
  return title;
}

export function ManageClient() {
  useRequireRole("organization");
  const t = useT(M);

  const [drafts, setDrafts] = useState<HackathonDraft[] | null>(null);
  const [mine, setMine] = useState<HackathonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, h] = await Promise.all([
          getHackathonDrafts(),
          getMyHackathons(),
        ]);
        if (cancelled) return;
        setDrafts(d);
        setMine(h);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : t("loadFailed"));
          setDrafts([]);
          setMine([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const onDiscard = async (draftId: string) => {
    if (!window.confirm(t("confirmDiscard"))) return;
    try {
      await deleteHackathonDraft(draftId);
      setDrafts((prev) => prev?.filter((d) => d.draftId !== draftId) ?? prev);
    } catch {
      /* ignore — the row stays */
    }
  };

  const statusLabel = (s: string): string =>
    s === "ongoing"
      ? t("statusLive")
      : s === "finished"
        ? t("statusFinished")
        : s === "cancelled"
          ? t("statusCancelled")
          : t("statusUpcoming");
  const statusClass = (s: string): string =>
    s === "ongoing"
      ? "hk-apply-approved"
      : s === "cancelled" || s === "finished"
        ? "hk-apply-rejected"
        : "hk-apply-pending";

  const loading = drafts === null || mine === null;

  return (
    <AppShell variant="no-right">
      <main className="hk-page" id="main">
        <div className="page-head">
          <Link className="col-back" href="/hackathons" aria-label={t("back")}>
            <Icon name="arrow-left" aria-hidden="true" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="hackathon" aria-hidden="true" /> {t("pageTitle")}
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        <div className="tabs-row tabs-row--divided">
          <div />
          <Link className="btn btn-primary hk-btn-lg" href="/hackathons/new">
            <Icon name="plus" aria-hidden="true" /> {t("create")}
          </Link>
        </div>

        {loading ? (
          <p className="page-sub" style={{ padding: "0 4px" }}>{t("loading")}</p>
        ) : (
          <>
            {error && (
              <p className="nh-server-err" style={{ margin: "0 4px 12px" }}>{error}</p>
            )}

            {/* DRAFTS */}
            {drafts.length > 0 && (
              <section className="hk-section">
                <div className="hk-section-head">
                  <div className="hk-section-title">
                    <Icon name="clock" aria-hidden="true" /> {t("draftsTitle")}
                  </div>
                </div>
                <div className="hk-apply-list">
                  {drafts.map((d) => (
                    <div className="hk-apply-row" key={d.draftId}>
                      <div className="hk-apply-status hk-apply-pending">
                        <Icon name="clock" aria-hidden="true" /> {t("draftsTitle")}
                      </div>
                      <div className="hk-apply-info">
                        <div className="hk-apply-name">
                          {draftTitle(d) || t("draftUntitled")}
                        </div>
                        <div className="hk-apply-meta">
                          {t("lastEdited")} {fmtDate(d.updatedAt)}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost hk-btn-sm"
                        onClick={() => onDiscard(d.draftId)}
                      >
                        <Icon name="x" aria-hidden="true" /> {t("discard")}
                      </button>
                      <Link
                        className="btn btn-primary hk-btn-sm"
                        href={`/hackathons/new?draft=${d.draftId}`}
                      >
                        {t("continueEdit")}
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* PUBLISHED */}
            <section className="hk-section">
              <div className="hk-section-head">
                <div className="hk-section-title">
                  <Icon name="shield" aria-hidden="true" /> {t("publishedTitle")}
                </div>
              </div>
              {mine.length === 0 ? (
                <p className="page-sub" style={{ padding: "4px" }}>{t("noHackathons")}</p>
              ) : (
                <div className="hk-apply-list">
                  {mine.map((h) => (
                    <div className="hk-apply-row" key={h.hackathonId}>
                      <div className={`hk-apply-status ${statusClass(h.status)}`}>
                        <Icon name="check" aria-hidden="true" /> {statusLabel(h.status)}
                      </div>
                      <div className="hk-apply-info">
                        <div className="hk-apply-name">{h.title}</div>
                        <div className="hk-apply-meta">
                          <strong>{h.participantCount}</strong> {t("participants")} ·{" "}
                          <strong>{h.teamCount}</strong> {t("teams")} · {fmtDate(h.startsAt)}
                        </div>
                      </div>
                      <Link
                        className="btn btn-ghost hk-btn-sm"
                        href={`/hackathons/${h.hackathonId}`}
                      >
                        {t("view")}
                      </Link>
                      <Link
                        className="btn btn-ghost hk-btn-sm"
                        href="/applications"
                      >
                        {t("applications")}
                      </Link>
                      <Link
                        className="btn btn-primary hk-btn-sm"
                        href={`/hackathons/${h.hackathonId}/edit`}
                      >
                        <Icon name="settings" aria-hidden="true" /> {t("edit")}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

export default ManageClient;
