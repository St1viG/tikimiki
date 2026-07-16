"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { HackathonSummary } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireRole } from "@/components/auth/AuthProvider";
import { ApiError, getMyHackathons, getTeamsOverview, type TeamOverview } from "@/lib/api";

/**
 * TeamsClient — the organizer's team-progress overview (route "/hackathons/teams").
 *
 * Picks a hackathon (same `?hackathonId=` convention as /applications), then
 * lists its teams with member count and project submission status, sourced
 * from GET /hackathons/:id/teams/overview. Each row links into the team's
 * kanban board for task-level detail.
 */

const M = {
  back: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Team progress", sr: "Progres timova" },
  pageSub: {
    en: "Member count and submission status per team.",
    sr: "Broj članova i status predaje po timu.",
  },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  loadFailed: { en: "Couldn't load teams.", sr: "Učitavanje timova nije uspelo." },
  noHackathons: {
    en: "You haven't organized any hackathons yet.",
    sr: "Još nisi organizovao nijedan hakaton.",
  },
  noTeams: { en: "No teams yet.", sr: "Još nema timova." },
  pickLabel: { en: "Hackathon", sr: "Hackathon" },
  pickAria: { en: "Select hackathon", sr: "Izaberi hackathon" },
  members: { en: "members", sr: "članova" },
  board: { en: "Board", sr: "Tabla" },

  statusNone: { en: "Not started", sr: "Nije početo" },
  statusDraft: { en: "Draft", sr: "Nacrt" },
  statusSubmitted: { en: "Submitted", sr: "Predato" },
  statusUnderReview: { en: "Under review", sr: "Na pregledu" },
  statusJudged: { en: "Judged", sr: "Ocenjeno" },
} as const;

function statusLabel(status: string | null, t: (k: keyof typeof M) => string): string {
  switch (status) {
    case "draft":
      return t("statusDraft");
    case "submitted":
      return t("statusSubmitted");
    case "under_review":
      return t("statusUnderReview");
    case "judged":
      return t("statusJudged");
    default:
      return t("statusNone");
  }
}
function statusClass(status: string | null): string {
  switch (status) {
    case "judged":
      return "hk-apply-approved";
    case "submitted":
    case "under_review":
      return "hk-apply-pending";
    default:
      return "hk-apply-neutral";
  }
}
function statusIcon(status: string | null): string {
  return status === "judged"
    ? "check"
    : status === "submitted" || status === "under_review"
      ? "flag"
      : "clock";
}

export function TeamsClient() {
  useRequireRole("organization");
  const t = useT(M);
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlHackathonId = searchParams.get("hackathonId");

  const [hackathons, setHackathons] = useState<HackathonSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(urlHackathonId);
  const [teams, setTeams] = useState<TeamOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyHackathons()
      .then((list) => {
        if (cancelled) return;
        setHackathons(list);
        setSelectedId((cur) =>
          cur && list.some((h) => h.hackathonId === cur) ? cur : (list[0]?.hackathonId ?? null),
        );
      })
      .catch(() => {
        if (!cancelled) setHackathons([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectHackathon = useCallback(
    (id: string) => {
      setSelectedId(id);
      router.replace(`/hackathons/teams?hackathonId=${id}`);
    },
    [router],
  );

  useEffect(() => {
    if (!selectedId) {
      setTeams(null);
      return;
    }
    let cancelled = false;
    setTeams(null);
    setError(null);
    getTeamsOverview(selectedId)
      .then((list) => {
        if (!cancelled) setTeams(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
        setTeams([]);
      });
    return () => {
      cancelled = true;
    };
    // `t` is re-created every render (useT isn't memoized) — keying this fetch
    // on it would refetch in a loop, so it's intentionally left out below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const loadingHackathons = hackathons === null;

  return (
    <main className="hk-page" id="main">
      <div className="page-head">
        <button
          type="button"
          className="col-back"
          aria-label={t("back")}
          onClick={() => router.back()}
        >
          <Icon name="arrow-left" aria-hidden="true" />
        </button>
        <div className="col-titles">
          <h1 className="page-title">
            <Icon name="teams" aria-hidden="true" /> {t("pageTitle")}
          </h1>
          <p className="page-sub">{t("pageSub")}</p>
        </div>
      </div>

      {loadingHackathons ? (
        <p className="page-sub" style={{ padding: "0 4px" }}>
          {t("loading")}
        </p>
      ) : hackathons.length === 0 ? (
        <p className="page-sub" style={{ padding: "0 4px" }}>
          {t("noHackathons")}
        </p>
      ) : (
        <>
          <div className="apps-picker">
            <label className="apps-picker-field">
              <span className="apps-picker-label">{t("pickLabel")}</span>
              <select
                className="apps-select"
                aria-label={t("pickAria")}
                value={selectedId ?? ""}
                onChange={(e) => selectHackathon(e.target.value)}
              >
                {hackathons.map((h) => (
                  <option key={h.hackathonId} value={h.hackathonId}>
                    {h.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <p className="hkt-error" style={{ margin: "0 4px 12px" }}>
              {error}
            </p>
          )}

          <section className="hk-section">
            {teams === null ? (
              <p className="page-sub" style={{ padding: "4px" }}>
                {t("loading")}
              </p>
            ) : teams.length === 0 ? (
              <p className="page-sub" style={{ padding: "4px" }}>
                {t("noTeams")}
              </p>
            ) : (
              <div className="hk-apply-list">
                {teams.map((team) => (
                  <div className="hk-apply-row" key={team.teamId}>
                    <div className={`hk-apply-status ${statusClass(team.projectStatus)}`}>
                      <Icon name={statusIcon(team.projectStatus)} aria-hidden="true" />{" "}
                      {statusLabel(team.projectStatus, t)}
                    </div>
                    <div className="hk-apply-info">
                      <div className="hk-apply-name">{team.name}</div>
                      <div className="hk-apply-meta">
                        <strong>{team.memberCount}</strong> {t("members")}
                      </div>
                    </div>
                    <Link className="btn btn-ghost hk-btn-sm" href={`/teams/${team.teamId}/kanban`}>
                      <Icon name="list" aria-hidden="true" /> {t("board")}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default TeamsClient;
