"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatNumber } from "@/lib/format";
import * as api from "@/lib/api";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/lib/api";

/* LeaderboardClient — the interactive leaderboard page (SSU17).
 *
 * Behaviour:
 *  - Period tabs and the hackathon <select> re-fetch the ranked list from
 *    GET /leaderboard (backed by real points/badges/hackathon-count data).
 *  - "Your position" is resolved from the authenticated user's id, not name.
 *
 * Supplies its own `<main className="lb" id="lb">`.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Leaderboard", sr: "Rang lista" },
  pageSub: {
    en: "Member rankings by total points",
    sr: "Rang lista članova po ukupnom broju poena",
  },
  searchLabel: { en: "Search", sr: "Pretraži" },
  searchPh: { en: "Search…", sr: "Pretraži…" },
  periodLabel: { en: "Leaderboard period", sr: "Period rang liste" },
  tabAll: { en: "All time", sr: "Svi" },
  tabMonth: { en: "This month", sr: "Ovaj mesec" },
  tabWeek: { en: "This week", sr: "Ova nedelja" },
  hackFilterLabel: { en: "Filter by hackathon", sr: "Filtriraj po hakathonu" },
  hackAll: { en: "All hackathons", sr: "Svi hakathoni" },
  podiumLabel: { en: "Top members", sr: "Najbolji članovi" },
  tableLabel: { en: "Leaderboard", sr: "Rang lista" },
  colRank: { en: "#", sr: "#" },
  colUser: { en: "User", sr: "Korisnik" },
  colPoints: { en: "Points", sr: "Poeni" },
  colBadges: { en: "Badges", sr: "Bedževi" },
  colHacks: { en: "Hackathons", sr: "Hakathoni" },
  mePill: { en: "you", sr: "ti" },
  myPositionLabel: { en: "Your position", sr: "Tvoja pozicija" },
  myPositionAria: { en: "Your position", sr: "Tvoja pozicija" },
  nextPlace: { en: "To the next place", sr: "Do sledećeg mesta" },
  ptsUnit: { en: "pts", sr: "pts" },
  pointsUnit: { en: "points", sr: "poena" },
  badgesUnit: { en: "badges", sr: "bedževa" },
  hacksUnit: { en: "hackathons", sr: "hakathona" },
  emptyFilter: { en: "No members for this hackathon.", sr: "Nema članova za ovaj hakaton." },
  loading: { en: "Loading leaderboard…", sr: "Učitavanje rang liste…" },
} as const;

type UiPeriod = "svi" | "mesec" | "nedelja";

const UI_TO_API_PERIOD: Record<UiPeriod, LeaderboardPeriod> = {
  svi: "all",
  mesec: "month",
  nedelja: "week",
};

/* Avatar palette class by rank tier (av-* classes). */
const AV_BY_RANK = ["av-gold", "av-silver", "av-green", "av-violet", "av-violet2"] as const;

interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

export function LeaderboardClient() {
  const t = useT(M);
  const { user } = useAuth();
  const [period, setPeriod] = useState<UiPeriod>("svi");
  const [hackFilter, setHackFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [hackathons, setHackathons] = useState<{ hackathonId: string; title: string }[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Hackathon options for the filter <select> — loaded once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.getHackathons();
        if (!cancelled) {
          setHackathons(list.map((h) => ({ hackathonId: h.hackathonId, title: h.title })));
        }
      } catch (err) {
        console.error("Failed to load hackathons", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ranked list — refetched whenever the period or hackathon filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await api.getLeaderboard(UI_TO_API_PERIOD[period], hackFilter || undefined);
        if (!cancelled) setEntries(rows);
      } catch (err) {
        if (!cancelled) console.error("Failed to load leaderboard", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, hackFilter]);

  const rankedFull = useMemo<RankedEntry[]>(
    () => entries.map((r, i) => ({ ...r, rank: i + 1 })),
    [entries],
  );

  // The table additionally honours the username search box.
  const ranked = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return q
      ? rankedFull.filter(
          (r) =>
            r.username.toLowerCase().includes(q) ||
            (r.displayName?.toLowerCase().includes(q) ?? false),
        )
      : rankedFull;
  }, [rankedFull, searchQ]);

  const podium = rankedFull.slice(0, 3);
  const me = user ? (rankedFull.find((r) => r.userId === user.userId) ?? null) : null;
  const nextUp = me ? (rankedFull.find((r) => r.rank === me.rank - 1) ?? null) : null;
  const toNext = me && nextUp ? nextUp.points - me.points : 0;

  return (
    <main className="lb" id="lb">
      <div className="page-head">
        <Link className="col-back" href="/" aria-label={t("backLabel")}>
          <Icon name="arrow-left" aria-hidden={undefined} />
        </Link>
        <div className="col-titles">
          <h1 className="page-title">
            <Icon name="trophy" /> {t("pageTitle")}
          </h1>
          <p className="page-sub">{t("pageSub")}</p>
        </div>
        <div className="search" role="search">
          <Icon name="search" />
          <input
            type="search"
            aria-label={t("searchLabel")}
            placeholder={t("searchPh")}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="lb-filters">
        <div className="lb-period-tabs" role="group" aria-label={t("periodLabel")}>
          <button
            className={`lb-tab${period === "svi" ? " active" : ""}`}
            onClick={() => setPeriod("svi")}
          >
            {t("tabAll")}
          </button>
          <button
            className={`lb-tab${period === "mesec" ? " active" : ""}`}
            onClick={() => setPeriod("mesec")}
          >
            {t("tabMonth")}
          </button>
          <button
            className={`lb-tab${period === "nedelja" ? " active" : ""}`}
            onClick={() => setPeriod("nedelja")}
          >
            {t("tabWeek")}
          </button>
        </div>
        <div className="lb-select-wrap">
          <select
            className="lb-hack-select"
            id="hack-filter"
            aria-label={t("hackFilterLabel")}
            value={hackFilter}
            onChange={(e) => setHackFilter(e.target.value)}
          >
            <option value="">{t("hackAll")}</option>
            {hackathons.map((h) => (
              <option key={h.hackathonId} value={h.hackathonId}>
                {h.title}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" />
        </div>
      </div>

      {loading ? (
        <section className="card">
          <p className="page-sub">{t("loading")}</p>
        </section>
      ) : (
        <>
          {/* Podium top 3 — rendered in visual order [2nd, 1st, 3rd] */}
          <section className="card" aria-label={t("podiumLabel")}>
            <div className="lb-podium" id="podium">
              {([1, 0, 2] as const).map((idx) => {
                const r = podium[idx];
                if (!r) return null;
                const place = idx + 1; // 1-based rank for this podium slot
                const medal = place === 1 ? "pm-gold" : place === 2 ? "pm-silver" : "pm-bronze";
                return (
                  <div className="podium-slot" key={r.userId}>
                    <span className={`podium-medal ${medal}`}>
                      <Icon name="trophy" /> {place}.
                    </span>
                    <div
                      className={`podium-avatar podium-avatar-${place} is-orb`}
                      aria-hidden="true"
                    >
                      {r.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar
                        <img src={r.avatarUrl} alt="" className="orb-art" />
                      ) : (
                        <GenerativeAvatar seed={r.username} className="orb-art" />
                      )}
                    </div>
                    <div className="podium-name">{r.displayName ?? r.username}</div>
                    <div className="podium-pts">
                      <b>{formatNumber(r.points)}</b> {t("ptsUnit")}
                    </div>
                    <div className={`podium-block podium-block-${place}`}>{place}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Table */}
          <section className="card lb-table" aria-label={t("tableLabel")}>
            <div className="lb-grid lb-table-head">
              <div className="col-num">{t("colRank")}</div>
              <div>{t("colUser")}</div>
              <div className="col-pts">{t("colPoints")}</div>
              <div className="col-badges">{t("colBadges")}</div>
              <div className="col-hacks">{t("colHacks")}</div>
            </div>

            {ranked.length === 0 && (
              <div className="lb-grid lb-row">
                <div style={{ gridColumn: "1 / -1", color: "var(--muted)" }}>
                  {t("emptyFilter")}
                </div>
              </div>
            )}

            {ranked.map((r) => {
              const isMe = user?.userId === r.userId;
              const avClass = AV_BY_RANK[Math.min(r.rank - 1, AV_BY_RANK.length - 1)];
              return (
                <div className={`lb-grid lb-row${isMe ? " lb-me" : ""}`} key={r.userId}>
                  <div
                    className={`lb-rank${isMe ? " lb-rank-me" : r.rank <= 3 ? ` lb-rank-${r.rank}` : ""}`}
                  >
                    {r.rank}
                  </div>
                  <div className="lb-user">
                    <span className={`avatar lb-av ${avClass} is-orb`} aria-hidden="true">
                      {r.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar
                        <img src={r.avatarUrl} alt="" className="orb-art" />
                      ) : (
                        <GenerativeAvatar seed={r.username} className="orb-art" />
                      )}
                    </span>
                    <span className="lb-username">{r.displayName ?? r.username}</span>
                    {isMe && <span className="lb-me-pill">{t("mePill")}</span>}
                  </div>
                  <div className="lb-pts">{formatNumber(r.points)}</div>
                  <div className="lb-badges">
                    <Icon name="shield" /> {r.badgeCount}
                  </div>
                  <div className="lb-hacks">{r.hackathonCount}</div>
                </div>
              );
            })}
          </section>

          {/* My position summary */}
          {me && (
            <section className="card lb-my-pos" aria-label={t("myPositionAria")}>
              <div className="lb-my-pos-rank">#{me.rank}</div>
              <div className="lb-my-pos-info">
                <div className="lb-my-pos-label">{t("myPositionLabel")}</div>
                <div className="lb-my-pos-sub">
                  {me.displayName ?? me.username} · {formatNumber(me.points)} {t("pointsUnit")} ·{" "}
                  {me.badgeCount} {t("badgesUnit")} · {me.hackathonCount} {t("hacksUnit")}
                </div>
              </div>
              {nextUp && (
                <div className="lb-my-pos-next">
                  {t("nextPlace")}
                  <b>
                    {formatNumber(toNext)} {t("ptsUnit")}
                  </b>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default LeaderboardClient;
