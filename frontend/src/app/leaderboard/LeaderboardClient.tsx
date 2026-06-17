"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatNumber } from "@/lib/format";

/* LeaderboardClient — the interactive leaderboard page.
 *
 * Behaviour:
 *  - Period tabs: clicking a tab sets it active (aria-selected + .active class).
 *  - Hackathon select: controlled value (no data change in this static mock).
 *
 * Supplies its own `<main className="lb" id="lb">`.
 */

const M = {
  backLabel:         { en: "Back",                                              sr: "Nazad" },
  pageTitle:         { en: "Leaderboard",                                       sr: "Rang lista" },
  pageSub:           { en: "Member rankings by total points",                   sr: "Rang lista članova po ukupnom broju poena" },
  searchLabel:       { en: "Search",                                            sr: "Pretraži" },
  searchPh:          { en: "Search…",                                           sr: "Pretraži…" },
  periodLabel:       { en: "Leaderboard period",                                sr: "Period rang liste" },
  tabAll:            { en: "All time",                                          sr: "Svi" },
  tabMonth:          { en: "This month",                                        sr: "Ovaj mesec" },
  tabWeek:           { en: "This week",                                         sr: "Ova nedelja" },
  hackFilterLabel:   { en: "Filter by hackathon",                               sr: "Filtriraj po hakathonu" },
  hackAll:           { en: "All hackathons",                                    sr: "Svi hakathoni" },
  podiumLabel:       { en: "Top members",                                       sr: "Najbolji članovi" },
  tableLabel:        { en: "Leaderboard",                                       sr: "Rang lista" },
  colRank:           { en: "#",                                                 sr: "#" },
  colUser:           { en: "User",                                              sr: "Korisnik" },
  colPoints:         { en: "Points",                                            sr: "Poeni" },
  colBadges:         { en: "Badges",                                            sr: "Bedževi" },
  colHacks:          { en: "Hackathons",                                        sr: "Hakathoni" },
  mePill:            { en: "you",                                               sr: "ti" },
  myPositionLabel:   { en: "Your position",                                     sr: "Tvoja pozicija" },
  myPositionAria:    { en: "Your position",                                     sr: "Tvoja pozicija" },
  nextPlace:         { en: "To the next place",                                 sr: "Do sledećeg mesta" },
  ptsUnit:           { en: "pts",                                               sr: "pts" },
  pointsUnit:        { en: "points",                                            sr: "poena" },
  badgesUnit:        { en: "badges",                                            sr: "bedževa" },
  hacksUnit:         { en: "hackathons",                                        sr: "hakathona" },
  emptyFilter:       { en: "No members for this hackathon.",                    sr: "Nema članova za ovaj hakaton." },
} as const;

type Period = "svi" | "mesec" | "nedelja";
type HackFilter = "" | "etf" | "garaza" | "hacknight" | "milano";

/* Avatar palette class by rank tier (av-* classes). */
const AV_BY_RANK = ["av-gold", "av-silver", "av-green", "av-violet", "av-violet2"] as const;

/**
 * Static mock leaderboard. There is NO member-leaderboard API (api.ts only
 * exposes team/game leaderboards), so this stays mock — but the period tabs and
 * hackathon <select> now filter/sort it client-side instead of being inert.
 *
 * Each row carries points per period and the set of hackathons it took part in,
 * so switching the period re-ranks the list and the select hides non-participants.
 */
interface Row {
  username: string;
  seed: string;
  pts: { svi: number; mesec: number; nedelja: number };
  badges: number;
  hacks: number;
  /** Hackathons this member participated in (HackFilter keys). */
  in: HackFilter[];
}

const ROWS: Row[] = [
  { username: "moljac",         seed: "moljac",        pts: { svi: 3200, mesec: 720, nedelja: 180 }, badges: 14, hacks: 11, in: ["etf", "garaza", "hacknight", "milano"] },
  { username: "Mohammed Avdol", seed: "mohammedavdol", pts: { svi: 2850, mesec: 540, nedelja: 90  }, badges: 11, hacks: 9,  in: ["etf", "garaza", "milano"] },
  { username: "miki",           seed: "miki",          pts: { svi: 2600, mesec: 610, nedelja: 220 }, badges: 9,  hacks: 8,  in: ["etf", "hacknight"] },
  { username: "Andrej Čolić",   seed: "andrej",        pts: { svi: 2450, mesec: 480, nedelja: 130 }, badges: 8,  hacks: 7,  in: ["etf", "garaza"] },
  { username: "fenjer",         seed: "fenjer",        pts: { svi: 2100, mesec: 300, nedelja: 70  }, badges: 7,  hacks: 7,  in: ["garaza", "hacknight"] },
  { username: "tiki",           seed: "tiki",          pts: { svi: 1900, mesec: 410, nedelja: 160 }, badges: 6,  hacks: 6,  in: ["etf", "milano"] },
  { username: "mara",           seed: "mara",          pts: { svi: 1750, mesec: 260, nedelja: 40  }, badges: 5,  hacks: 5,  in: ["hacknight"] },
  { username: "nullptr",        seed: "nullptr",       pts: { svi: 1500, mesec: 330, nedelja: 110 }, badges: 4,  hacks: 4,  in: ["etf", "garaza", "hacknight"] },
  { username: "lale",           seed: "lale",          pts: { svi: 1200, mesec: 150, nedelja: 30  }, badges: 3,  hacks: 4,  in: ["garaza"] },
  { username: "menjači",        seed: "menjaci",       pts: { svi: 980,  mesec: 200, nedelja: 95  }, badges: 2,  hacks: 3,  in: ["milano"] },
];

export function LeaderboardClient() {
  const t = useT(M);
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("svi");
  const [hackFilter, setHackFilter] = useState<HackFilter>("");
  const [searchQ, setSearchQ] = useState("");

  // Identify "you" from auth when possible, else fall back to the mock row.
  const meUsername = user?.username ?? "Andrej Čolić";

  // Rank by the hackathon filter + period (podium / "your position" use this).
  const rankedFull = useMemo(() => {
    return ROWS.filter((r) => !hackFilter || r.in.includes(hackFilter))
      .slice()
      .sort((a, b) => b.pts[period] - a.pts[period])
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [hackFilter, period]);

  // The table additionally honours the username search box.
  const ranked = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return q
      ? rankedFull.filter((r) => r.username.toLowerCase().includes(q))
      : rankedFull;
  }, [rankedFull, searchQ]);

  const podium = rankedFull.slice(0, 3);
  const me = rankedFull.find((r) => r.username === meUsername) ?? null;
  const nextUp = me ? rankedFull.find((r) => r.rank === me.rank - 1) ?? null : null;
  const toNext = me && nextUp ? nextUp.pts[period] - me.pts[period] : 0;

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
        <div
          className="lb-period-tabs"
          role="group"
          aria-label={t("periodLabel")}
        >
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
            onChange={(e) => setHackFilter(e.target.value as HackFilter)}
          >
            <option value="">{t("hackAll")}</option>
            <option value="etf">ETF HackWeek 2026</option>
            <option value="garaza">Garaža Hackathon &#39;25</option>
            <option value="hacknight">HackNight #1</option>
            <option value="milano">MilanoInno 2024</option>
          </select>
          <Icon name="chevron-down" />
        </div>
      </div>

      {/* Podium top 3 — rendered in visual order [2nd, 1st, 3rd] */}
      <section className="card" aria-label={t("podiumLabel")}>
        <div className="lb-podium" id="podium">
          {([1, 0, 2] as const).map((idx) => {
            const r = podium[idx];
            if (!r) return null;
            const place = idx + 1; // 1-based rank for this podium slot
            const medal = place === 1 ? "pm-gold" : place === 2 ? "pm-silver" : "pm-bronze";
            return (
              <div className="podium-slot" key={r.username}>
                <span className={`podium-medal ${medal}`}>
                  <Icon name="trophy" /> {place}.
                </span>
                <div
                  className={`podium-avatar podium-avatar-${place} is-orb`}
                  aria-hidden="true"
                >
                  <GenerativeAvatar seed={r.seed} className="orb-art" />
                </div>
                <div className="podium-name">{r.username}</div>
                <div className="podium-pts">
                  <b>{formatNumber(r.pts[period])}</b> {t("ptsUnit")}
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
          const isMe = r.username === meUsername;
          const avClass = AV_BY_RANK[Math.min(r.rank - 1, AV_BY_RANK.length - 1)];
          return (
            <div
              className={`lb-grid lb-row${isMe ? " lb-me" : ""}`}
              key={r.username}
            >
              <div className={`lb-rank${isMe ? " lb-rank-me" : r.rank <= 3 ? ` lb-rank-${r.rank}` : ""}`}>
                {r.rank}
              </div>
              <div className="lb-user">
                <span className={`avatar lb-av ${avClass} is-orb`} aria-hidden="true">
                  <GenerativeAvatar seed={r.seed} className="orb-art" />
                </span>
                <span className="lb-username">{r.username}</span>
                {isMe && <span className="lb-me-pill">{t("mePill")}</span>}
              </div>
              <div className="lb-pts">{formatNumber(r.pts[period])}</div>
              <div className="lb-badges">
                <Icon name="shield" /> {r.badges}
              </div>
              <div className="lb-hacks">{r.hacks}</div>
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
              {me.username} · {formatNumber(me.pts[period])} {t("pointsUnit")} · {me.badges}{" "}
              {t("badgesUnit")} · {me.hacks} {t("hacksUnit")}
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
    </main>
  );
}

export default LeaderboardClient;
