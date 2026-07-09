"use client";

import { Icon } from "@/components/Icon";
import { OVERALL_STREAK, PLAYED_TODAY, TOTAL_GAMES } from "@/lib/gamehub/mock";
import { useT } from "@/components/i18n/LanguageProvider";

const M = {
  yourStreak: { en: "Your streak", sr: "Tvoja serija" },
  daysInRow: { en: "days in a row", sr: "dana zaredom" },
  longest: { en: "longest:", sr: "najduža:" },
  today: { en: "Today", sr: "Danas" },
  playedCount: { en: "played", sr: "odigrano" },
  last7: { en: "Last 7 days", sr: "Poslednjih 7 dana" },
  mon: { en: "Mon", sr: "Pon" },
  tue: { en: "Tue", sr: "Uto" },
  wed: { en: "Wed", sr: "Sre" },
  thu: { en: "Thu", sr: "Čet" },
  fri: { en: "Fri", sr: "Pet" },
  sat: { en: "Sat", sr: "Sub" },
  sun: { en: "Sun", sr: "Ned" },
} as const;

/**
 * StreakBand — the GameHub hero header.
 *
 * Shows the user's overall daily streak as an oversized, tilted mono number
 * (the page's one grid-break moment) with the best-streak sub, a today-progress
 * indicator ("X/5 odigrano danas") with a slim progress bar, and a compact
 * 7-day mini calendar of played / not-played dots. On-brand: lemon is the live
 * accent, spent sparingly on the streak number + progress fill.
 */

/**
 * Last 7 days of play history (oldest -> today). Deterministic-but-static for
 * the mock layer; the final dot ("danas") lights only once today is "active".
 */
const WEEK: { key: keyof typeof M; played: boolean; today?: boolean }[] = [
  { key: "mon", played: true },
  { key: "tue", played: true },
  { key: "wed", played: true },
  { key: "thu", played: false },
  { key: "fri", played: true },
  { key: "sat", played: true },
  { key: "sun", played: PLAYED_TODAY > 0, today: true },
];

export function StreakBand() {
  const t = useT(M);
  const pct = TOTAL_GAMES > 0 ? Math.round((PLAYED_TODAY / TOTAL_GAMES) * 100) : 0;

  return (
    <section className="streak-band" aria-label={t("yourStreak")}>
      {/* Oversized streak number — the grid-break moment */}
      <div className="sb-hero">
        <Icon name="flame" className="sb-flame" />
        <div className="sb-num-wrap">
          <span className="sb-num tnum">{OVERALL_STREAK.current}</span>
          <span className="sb-num-cap">
            <span className="sb-num-days">{t("daysInRow")}</span>
            <span className="sb-best">
              {t("longest")} <span className="tnum">{OVERALL_STREAK.best}</span>
            </span>
          </span>
        </div>
      </div>

      {/* Today progress + mini week calendar */}
      <div className="sb-side">
        <div className="sb-progress">
          <div className="sb-progress-top">
            <span className="sb-progress-label">{t("today")}</span>
            <span className="sb-progress-count u-mono">
              {PLAYED_TODAY}/{TOTAL_GAMES} {t("playedCount")}
            </span>
          </div>
          <div
            className="sb-bar"
            role="progressbar"
            aria-valuenow={PLAYED_TODAY}
            aria-valuemin={0}
            aria-valuemax={TOTAL_GAMES}
          >
            <div className="sb-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="sb-week" aria-label={t("last7")}>
          {WEEK.map((d) => (
            <div
              className={`sb-day${d.played ? " is-on" : ""}${d.today ? " is-today" : ""}`}
              key={d.key}
            >
              <span className="sb-dot" aria-hidden="true" />
              <span className="sb-day-label">{t(d.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default StreakBand;
