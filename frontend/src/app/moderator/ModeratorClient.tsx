"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ModeratorRemoveModal } from "@/components/popups/ModeratorRemoveModal";
import { ModeratorWarnModal } from "@/components/popups/ModeratorWarnModal";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import {
  ApiError,
  getReports,
  getServer,
  resolveReport as apiResolveReport,
  type Report,
} from "@/lib/api";

/* ModeratorClient — interactive moderator panel, wired to the live reports API
 * (api.getReports / api.resolveReport). Supplies its own
 * `<main className="mod-page" id="main">`.
 *
 * Two modes, both server-enforced (this component just reflects what the API
 * allows):
 *  - Global (`?server` absent): every report, platform-wide — admin only.
 *  - Scoped (`?server=<serverId>`): that Cohor server's message reports only
 *    — its hackathon's organizer, an assigned server "Moderator", or an
 *    admin. A caller without access gets a 403 from the API and is bounced
 *    home, same as the old admin-only gate did for non-admins.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Content reports", sr: "Prijave sadržaja" },
  modeBadge: { en: "Admin", sr: "Admin" },
  modeBadgeServer: { en: "Moderator", sr: "Moderator" },
  accessDenied: {
    en: "You don't have access to this server's reports.",
    sr: "Nemaš pristup prijavama ovog servera.",
  },
  searchLabel: { en: "Search", sr: "Pretraži" },
  searchPh: { en: "Search…", sr: "Pretraži…" },
  statOpen: { en: "Open reports", sr: "Otvorene prijave" },
  statResolved: { en: "Resolved today", sr: "Rešene danas" },
  statTotal: { en: "Total", sr: "Ukupno" },
  filterSearchAria: {
    en: "Search reports by user or content",
    sr: "Pretraži prijave po korisniku ili sadržaju",
  },
  filterSearchPh: {
    en: "Search reports by user or content…",
    sr: "Pretraži prijave po korisniku ili sadržaju…",
  },
  chipStatus: { en: "Status: Open", sr: "Status: Otvorene" },
  chipReason: { en: "Reason", sr: "Razlog" },
  chipSort: { en: "Sort:", sr: "Sortiraj:" },
  chipNewest: { en: "Newest", sr: "Najnovije" },
  removeMsgBtn: { en: "Remove comment", sr: "Ukloni komentar" },
  removePostBtn: { en: "Remove post", sr: "Ukloni objavu" },
  removeMessageBtn: { en: "Remove message", sr: "Ukloni poruku" },
  resolveBtn: { en: "Resolve", sr: "Reši" },
  dismissBtn: { en: "Dismiss report", sr: "Odbaci prijavu" },
  viewProfileBtn: { en: "View profile", sr: "Pregledaj profil" },
  resolvedLabel: { en: "Resolved", sr: "Rešeno" },
  showCount: { en: "Showing", sr: "Prikazano" },
  ofCount: { en: "of", sr: "od" },
  reportsFor: { en: "reports", sr: "prijava" },
  dismissModalTitle: { en: "Dismiss report", sr: "Odbaci prijavu" },
  dismissModalBody: {
    en: "The report will be marked as dismissed. The reporter will be notified that the content did not violate community guidelines.",
    sr: "Prijava će biti označena kao odbačena. Podnosilac prijave će biti obavešten da sadržaj nije prekršio pravila zajednice.",
  },
  dismissModalCancel: { en: "Cancel", sr: "Otkaži" },
  dismissModalConfirm: { en: "Dismiss", sr: "Odbaci" },
  toastRemovedOnly: {
    en: "Content removed. Reporter notified.",
    sr: "Sadržaj uklonjen. Podnosilac prijave je obavešten.",
  },
  toastRemovedAndBanned: {
    en: "Content removed and user banned. Reporter notified.",
    sr: "Sadržaj uklonjen, korisnik banovan. Podnosilac prijave je obavešten.",
  },
  toastBannedOnly: {
    en: "User banned. Reporter notified.",
    sr: "Korisnik banovan. Podnosilac prijave je obavešten.",
  },
  toastResolved: {
    en: "Report resolved. Reporter notified.",
    sr: "Prijava rešena. Podnosilac prijave je obavešten.",
  },
  toastDismissed: {
    en: "Report dismissed. Reporter notified.",
    sr: "Prijava odbijena. Podnosilac je obavešten.",
  },
  toastError: {
    en: "Could not process the report. Please try again.",
    sr: "Prijava nije mogla biti obrađena. Pokušajte ponovo.",
  },
  loading: { en: "Loading reports…", sr: "Učitavanje prijava…" },
  empty: { en: "No open reports.", sr: "Nema otvorenih prijava." },
  reportedBy: { en: "Reported by", sr: "Prijavio" },
  reportKind: { en: "Report", sr: "Prijava" },
  targetLabel: { en: "Target", sr: "Cilj" },
} as const;

type ModalKind = "remove" | "warn" | "dismiss" | null;

/* Map a report category to a reason-pill modifier class. */
function reasonClass(category: string): string {
  if (category === "spam") return "mod-reason-spam";
  if (category === "harassment") return "mod-reason-offensive";
  if (category === "inappropriate_content") return "mod-reason-misinfo";
  return "mod-reason-offensive";
}

export function ModeratorClient() {
  const auth = useRequireAuth();
  const t = useT(M);
  const router = useRouter();
  const searchParams = useSearchParams();
  const serverId = searchParams.get("server");
  const [serverName, setServerName] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<{ open: number; resolvedToday: number; total: number }>({
    open: 0,
    resolvedToday: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [pendingReportId, setPendingReportId] = useState<string | null>(null);
  const [toastText, setToastText] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chip1Active, setChip1Active] = useState(true);
  const [chip2Active, setChip2Active] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let active = true;
    (async () => {
      try {
        const data = await getReports("pending", serverId ?? undefined);
        if (!active) return;
        setReports(data.reports);
        setStats(data.stats);
        if (serverId) {
          getServer(serverId)
            .then((s) => active && setServerName(s.name))
            .catch(() => {
              /* header falls back to a generic label */
            });
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 403) {
          setAccessDenied(true);
          return;
        }
        console.error("Failed to load reports", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [auth.status, serverId]);

  const showToast = useCallback((msg: string) => {
    setToastText(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 3500);
  }, []);

  const openResolveModal = (reportId: string, modal: ModalKind) => {
    setPendingReportId(reportId);
    setOpenModal(modal);
  };

  const closeModal = () => {
    setOpenModal(null);
    setPendingReportId(null);
  };

  const confirmAction = async (
    decision: "resolved" | "dismissed",
    opts: { removeContent?: boolean; banUser?: boolean } = {},
  ) => {
    const reportId = pendingReportId;
    closeModal();
    if (!reportId) return;

    // Optimistically drop the report from the open list and adjust stats.
    const prevReports = reports;
    const prevStats = stats;
    setReports((rs) => rs.filter((r) => r.reportId !== reportId));
    setStats((s) => ({ ...s, open: Math.max(0, s.open - 1), resolvedToday: s.resolvedToday + 1 }));

    const toastMsg =
      decision === "dismissed"
        ? t("toastDismissed")
        : opts.removeContent && opts.banUser
          ? t("toastRemovedAndBanned")
          : opts.removeContent
            ? t("toastRemovedOnly")
            : opts.banUser
              ? t("toastBannedOnly")
              : t("toastResolved");

    try {
      await apiResolveReport(reportId, decision, opts);
      showToast(toastMsg);
    } catch (err) {
      console.error("Failed to resolve report", err);
      // Revert on failure.
      setReports(prevReports);
      setStats(prevStats);
      showToast(t("toastError"));
    }
  };

  const isVisible = (report: Report) => {
    if (!searchQuery) return true;
    const haystack =
      `${report.reason ?? ""} ${report.category} ${report.reporterUsername} ${report.targetType} ${report.targetId}`.toLowerCase();
    return haystack.includes(searchQuery.toLowerCase());
  };

  const visibleReports = reports.filter(isVisible);
  const modeLabel = serverId ? t("modeBadgeServer") : t("modeBadge");
  // .page-title is globally forced to a single-line, ellipsis-truncated
  // heading (see globals.css) — a pill badge nested inside it gets clipped
  // instead of shown, so the server name goes into the title text itself
  // (which the global truncation handles fine) instead of a separate badge.
  // .page-sub is globally display:none, so scoped context can't live there.
  const titleText = serverId && serverName ? `${t("pageTitle")} — ${serverName}` : t("pageTitle");

  if (accessDenied) {
    return (
      <main className="mod-page" id="main">
        <div className="page-head">
          <button
            type="button"
            className="col-back"
            aria-label={t("backLabel")}
            onClick={() => router.back()}
          >
            <Icon name="arrow-left" />
          </button>
          <div className="col-titles">
            <h1 className="page-title">{t("pageTitle")}</h1>
            <p style={{ color: "var(--muted)", fontSize: "13.5px" }}>{t("accessDenied")}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="mod-page" id="main" data-filter="prijave">
        {/* PAGE HEADER */}
        <div className="page-head">
          <button
            type="button"
            className="col-back"
            aria-label={t("backLabel")}
            onClick={() => router.back()}
          >
            <Icon name="arrow-left" />
          </button>
          <div className="col-titles">
            <h1 className="page-title">{titleText}</h1>
          </div>
          <div className="search" role="search">
            <Icon name="search" />
            <input type="search" aria-label={t("searchLabel")} placeholder={t("searchPh")} />
          </div>
          <div className="mod-admin-chip">
            <span className="avatar v is-orb" aria-hidden="true">
              <GenerativeAvatar seed={auth.user?.username ?? "admin"} className="orb-art" />
            </span>
            <div>
              <div className="mod-admin-chip-name">{auth.user?.username ?? ""}</div>
              <div className="mod-admin-chip-sub">{modeLabel}</div>
            </div>
          </div>
        </div>

        {/* STATS ROW */}
        <div className="mod-stats">
          <div className="mod-stat mod-stat--lead">
            <div className="mod-stat-label">{t("statOpen")}</div>
            <div className="mod-stat-val v-red" id="count-open">
              {stats.open}
            </div>
          </div>
          <div className="mod-stat">
            <div className="mod-stat-label">{t("statResolved")}</div>
            <div className="mod-stat-val v-violet" id="count-resolved">
              {stats.resolvedToday}
            </div>
          </div>
          <div className="mod-stat">
            <div className="mod-stat-label">{t("statTotal")}</div>
            <div className="mod-stat-val">{stats.total}</div>
          </div>
        </div>

        {/* FILTER BAR + REPORT LIST */}
        <section className="adm-section" data-section="prijave">
          <div className="mod-filter-bar">
            <div className="mod-search" role="search">
              <Icon name="search" />
              <input
                type="search"
                aria-label={t("filterSearchAria")}
                placeholder={t("filterSearchPh")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="mod-chips-row">
              <button
                className={`mod-chip${chip1Active ? " mod-chip-active" : ""}`}
                onClick={() => setChip1Active((v) => !v)}
              >
                {t("chipStatus")} <Icon name="chevron-down" />
              </button>
              <button
                className={`mod-chip${chip2Active ? " mod-chip-active" : ""}`}
                onClick={() => setChip2Active((v) => !v)}
              >
                {t("chipReason")} <Icon name="chevron-down" />
              </button>
              <span className="mod-chip-sort">
                {t("chipSort")} <strong>{t("chipNewest")}</strong> <Icon name="chevron-down" />
              </span>
            </div>
          </div>

          <div className="mod-list" style={{ marginTop: "14px" }}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div className="mod-report" key={`skel-${i}`} aria-busy="true">
                  <div className="mod-report-head">
                    <span
                      className="skel"
                      aria-hidden="true"
                      style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0 }}
                    />
                    <div className="mod-report-titlewrap">
                      <span className="skel skel-line" style={{ width: 110, height: 13 }} />
                      <span
                        className="skel skel-line"
                        style={{ width: 200, height: 11, marginTop: 7 }}
                      />
                    </div>
                    <span
                      className="skel"
                      aria-hidden="true"
                      style={{ width: 84, height: 25, borderRadius: 999 }}
                    />
                  </div>
                  <div className="mod-report-meta">
                    <span className="skel skel-line" style={{ width: 140, height: 12 }} />
                    <span className="skel skel-line" style={{ width: 170, height: 12 }} />
                  </div>
                  <div className="mod-report-actions mod-actions">
                    <span
                      className="skel"
                      aria-hidden="true"
                      style={{ width: 104, height: 34, borderRadius: 9 }}
                    />
                    <span
                      className="skel"
                      aria-hidden="true"
                      style={{ width: 96, height: 34, borderRadius: 9 }}
                    />
                    <span
                      className="skel"
                      aria-hidden="true"
                      style={{ width: 88, height: 34, borderRadius: 9 }}
                    />
                  </div>
                </div>
              ))
            ) : visibleReports.length === 0 ? (
              <p className="page-sub">{t("empty")}</p>
            ) : (
              visibleReports.map((report) => {
                const canRemoveContent =
                  report.targetType === "post" ||
                  report.targetType === "comment" ||
                  report.targetType === "message";
                return (
                  <div className="mod-report" id={report.reportId} key={report.reportId}>
                    <div className="mod-report-head">
                      <div className="avatar av-r is-orb" aria-hidden="true">
                        <GenerativeAvatar seed={report.reporterUsername} className="orb-art" />
                      </div>
                      <div className="mod-report-titlewrap">
                        <div className="mod-report-kind">{t("reportKind")}</div>
                        <div className="mod-report-by">
                          {t("reportedBy")} <strong>@{report.reporterUsername}</strong> ·{" "}
                          {new Date(report.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <span className={`mod-reason ${reasonClass(report.category)}`}>
                        <Icon name="flag" /> {report.category}
                      </span>
                    </div>
                    <div className="mod-report-meta">
                      <span>
                        {t("targetLabel")}: <strong>{report.targetType}</strong>
                      </span>
                      <span>
                        ID: <strong>{report.targetId}</strong>
                      </span>
                      {report.reason && (
                        <span>
                          {t("chipReason")}: <strong>{report.reason}</strong>
                        </span>
                      )}
                    </div>
                    <div className="mod-report-actions mod-actions">
                      {canRemoveContent && (
                        <button
                          className="mod-btn-xs danger"
                          onClick={() => openResolveModal(report.reportId, "remove")}
                        >
                          <Icon name="x" />{" "}
                          {report.targetType === "post"
                            ? t("removePostBtn")
                            : report.targetType === "message"
                              ? t("removeMessageBtn")
                              : t("removeMsgBtn")}
                        </button>
                      )}
                      <button
                        className="mod-btn-xs warn"
                        onClick={() => openResolveModal(report.reportId, "warn")}
                      >
                        <Icon name="flag" /> {t("resolveBtn")}
                      </button>
                      <button
                        className="mod-btn-xs ok"
                        onClick={() => openResolveModal(report.reportId, "dismiss")}
                      >
                        <Icon name="check" /> {t("dismissBtn")}
                      </button>
                      <Link className="mod-btn-xs profile" href={`/u/${report.reporterUsername}`}>
                        {t("viewProfileBtn")}
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mod-count-foot">
            {t("showCount")} <span className="tnum">{visibleReports.length}</span> {t("ofCount")}{" "}
            <span className="tnum">{stats.total}</span> {t("reportsFor")}
          </div>
        </section>
      </main>

      {/* Action modals */}
      <ModeratorRemoveModal
        open={openModal === "remove"}
        onClose={closeModal}
        onConfirm={(banUser) => confirmAction("resolved", { removeContent: true, banUser })}
      />

      <ModeratorWarnModal
        open={openModal === "warn"}
        onClose={closeModal}
        onConfirm={(banUser) => confirmAction("resolved", { banUser })}
      />

      {/* Dismiss modal (inline — single-use variant) */}
      <div
        id="modal-dismiss"
        className={`modal-overlay${openModal === "dismiss" ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-dismiss-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal-box">
          <div className="modal-title" id="modal-dismiss-title">
            <Icon name="check" /> {t("dismissModalTitle")}
          </div>
          <div className="modal-body">{t("dismissModalBody")}</div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={closeModal}>
              {t("dismissModalCancel")}
            </button>
            <button
              className="btn btn-violet modal-confirm"
              onClick={() => confirmAction("dismissed")}
            >
              {t("dismissModalConfirm")}
            </button>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      <div
        id="mod-toast"
        className={`mod-toast${toastVisible ? " show" : ""}`}
        role="status"
        aria-live="polite"
      >
        <Icon name="check" />
        <span id="mod-toast-text">{toastText}</span>
      </div>
    </>
  );
}

export default ModeratorClient;
