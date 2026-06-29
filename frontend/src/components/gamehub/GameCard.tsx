"use client";

import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import type { GameId, GameMeta, GameResult } from "@/lib/gamehub/types";
import {
  FRIEND_PLAYS,
  STREAKS,
  TODAY_RESULTS,
} from "@/lib/gamehub/mock";
import { useT } from "@/components/i18n/LanguageProvider";

/* UI chrome strings. */
const M = {
  bestStreak: { en: "Longest streak", sr: "Najduža serija" },
  streakAria: { en: "Streak", sr: "Serija" },
  days: { en: "days", sr: "dana" },
  played: { en: "Played", sr: "Odigrano" },
  playedAria: { en: "Played", sr: "Odigrano" },
  play: { en: "Play", sr: "Igraj" },
  friendsAria: {
    en: "See how friends did",
    sr: "Vidi kako su prošli prijatelji",
  },
  seeAll: { en: "see all", sr: "vidi sve" },
  open: { en: "Open", sr: "Otvori" },
  metricNagrada: { en: "Prize", sr: "Nagrada" },
  metricRezultat: { en: "Result", sr: "Rezultat" },
  metricPokusaji: { en: "Attempts", sr: "Pokušaji" },
  metricGreske: { en: "Mistakes", sr: "Greške" },
  metricVreme: { en: "Time", sr: "Vreme" },
  // Game display names (proper nouns mostly) + taglines.
  name_spin: { en: "Daily Spin", sr: "Daily Spin" },
  name_quiz: { en: "Dev Quiz", sr: "Dev Kviz" },
  name_kodword: { en: "Kodword", sr: "Kodword" },
  name_grupe: { en: "Groups", sr: "Grupe" },
  name_tempo: { en: "Tempo", sr: "Tempo" },
  tag_spin: {
    en: "Spin the wheel and win a prize",
    sr: "Okreni točak i osvoji nagradu",
  },
  tag_quiz: {
    en: "Five questions from dev folklore",
    sr: "Pet pitanja iz dev folklora",
  },
  tag_kodword: {
    en: "Guess the daily dev term",
    sr: "Pogodi dnevni dev pojam",
  },
  tag_grupe: {
    en: "Connect 16 terms into 4 groups",
    sr: "Poveži 16 pojmova u 4 grupe",
  },
  tag_tempo: {
    en: "Speed of typing code",
    sr: "Brzina kucanja koda",
  },
} as const;

/** Map a mock metricLabel (Serbian) to a translation key. */
const METRIC_KEY: Record<string, keyof typeof M> = {
  Nagrada: "metricNagrada",
  Rezultat: "metricRezultat",
  Pokušaji: "metricPokusaji",
  Greške: "metricGreske",
  Vreme: "metricVreme",
};

/**
 * GameCard — one daily-game card (NYT / LinkedIn Games style).
 *
 * Presents a single {@link GameMeta}: an accent-tinted icon tile, the game name
 * (display font) + tagline, a per-game STREAK chip (flame + mono day count,
 * dimmed at 0), the user's TODAY state (a played result in mono with an
 * "odigrano" check, or a prominent "Igraj" primary button), a compact
 * LinkedIn-style FRIENDS-COMPARISON strip (overlapped avatars + the leader's
 * result + a muted "+N · vidi sve"), and the metric label.
 *
 * Clicking the card or its Igraj button calls `onPlay(id)`.
 */

/** Lower-is-better metrics rank ascending; everything else descending. */
function leaderOf(id: GameId) {
  const plays = FRIEND_PLAYS[id] ?? [];
  if (plays.length === 0) return undefined;
  const kind = plays[0].result.kind;
  const lowerBetter = kind === "time" || kind === "tries";
  const ranked = [...plays]
    .filter((p) => p.result.raw !== undefined)
    .sort((a, b) =>
      lowerBetter
        ? (a.result.raw ?? 0) - (b.result.raw ?? 0)
        : (b.result.raw ?? 0) - (a.result.raw ?? 0),
    );
  return ranked[0] ?? plays[0];
}

export function GameCard({
  game,
  onPlay,
  freshResult,
  freshlyPlayed,
}: {
  game: GameMeta;
  onPlay: (id: GameId) => void;
  /** A result the user just earned this session (overrides the mock TODAY_RESULTS). */
  freshResult?: GameResult;
  /** When true, bump the per-game streak chip by 1 (this session's just-played UX). */
  freshlyPlayed?: boolean;
}) {
  const t = useT(M);
  const baseStreak = STREAKS[game.id];
  // A freshly-played, previously-unplayed game bumps its streak chip by one.
  const streak =
    freshlyPlayed && !baseStreak.playedToday
      ? { ...baseStreak, current: baseStreak.current + 1, playedToday: true }
      : baseStreak;
  const today = freshResult ?? TODAY_RESULTS[game.id];
  const friends = FRIEND_PLAYS[game.id] ?? [];
  const leader = leaderOf(game.id);
  const shown = friends.slice(0, 4);
  const extra = Math.max(0, friends.length - shown.length);

  const played = Boolean(today);

  return (
    <article
      className={`gc gc-${game.accent}`}
      data-played={played ? "true" : undefined}
    >
      {/* Header: icon tile + title/tagline + streak chip */}
      <header className="gc-head">
        <span className="gc-tile" aria-hidden="true">
          <Icon name={game.icon} />
        </span>
        <div className="gc-titles">
          <h3 className="gc-name">{t(`name_${game.id}` as keyof typeof M)}</h3>
          <p className="gc-tagline">{t(`tag_${game.id}` as keyof typeof M)}</p>
        </div>
        <span
          className={`gc-streak${streak.current === 0 ? " is-zero" : ""}`}
          title={`${t("bestStreak")}: ${streak.best}`}
          aria-label={`${t("streakAria")}: ${streak.current} ${t("days")}`}
        >
          <Icon name="flame" />
          <span className="tnum">{streak.current}</span>
        </span>
      </header>

      {/* Your today state */}
      <div className="gc-today">
        {played ? (
          <div className="gc-done" aria-label={`${t("playedAria")}: ${today!.display}`}>
            <span className="gc-done-check" aria-hidden="true">
              <Icon name="check" />
            </span>
            <span className="gc-done-label">{t("played")}</span>
            <span className="gc-done-result u-mono">{today!.display}</span>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary gc-play"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(game.id);
            }}
          >
            {t("play")}
          </button>
        )}
        <span className="gc-metric">
          {t(METRIC_KEY[game.metricLabel] ?? "metricRezultat")}
        </span>
      </div>

      {/* Friends comparison strip (LinkedIn-style) */}
      {friends.length > 0 && (
        <button
          type="button"
          className="gc-friends"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(game.id);
          }}
          aria-label={t("friendsAria")}
        >
          <span className="gc-avs" aria-hidden="true">
            {shown.map((p) => (
              <span className="gc-av" key={p.handle}>
                <GenerativeAvatar seed={p.handle} variant="orbit" size={26} />
              </span>
            ))}
          </span>
          <span className="gc-friends-text">
            {leader && (
              <span className="gc-leader">
                <b>{leader.name.split(" ")[0]}</b>{" "}
                <span className="u-mono">{leader.result.display}</span>
              </span>
            )}
            <span className="gc-friends-more">
              {extra > 0 ? `+${extra} · ` : ""}
              {t("seeAll")}
            </span>
          </span>
        </button>
      )}

      {/* Full-card click target (behind interactive children) */}
      <button
        type="button"
        className="gc-hit"
        aria-label={`${t("open")}: ${t(`name_${game.id}` as keyof typeof M)}`}
        tabIndex={-1}
        onClick={() => onPlay(game.id)}
      />
    </article>
  );
}

export default GameCard;
