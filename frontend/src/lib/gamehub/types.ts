/**
 * GameHub — shared types for the daily-games hub.
 *
 * Every playable game (Phase 3) implements {@link GameModalProps} as a
 * self-contained modal overlay and reports its outcome via
 * {@link GameResult}. The hub shell (cards, streak band, friends panel) and the
 * mock data layer (src/lib/gamehub/mock.ts) are all typed against the contracts
 * defined here, so swapping the placeholder registry for real games in Phase 3
 * touches nothing but the registry imports.
 */

/** The five daily games, in hub display order. */
export type GameId = "spin" | "quiz" | "kodword" | "grupe" | "tempo";

/**
 * How a result reads as a metric:
 *  - "score"  — higher is better (e.g. quiz "4/5")
 *  - "time"   — lower is better  (e.g. tempo "01:12")
 *  - "tries"  — lower is better  (e.g. kodword "3/6 pokušaja")
 *  - "reward" — not comparable / informational (e.g. spin "+100 XP")
 */
export type ResultKind = "score" | "time" | "tries" | "reward";

/**
 * A single game outcome (yours or a friend's).
 *
 * `display` is the human string shown in the UI (already localized), e.g.
 * "4/5", "01:12", "3/6 pokušaja", "+100 XP". `raw` is the comparable number
 * used to sort/compare friend results: lower-is-better for "time"/"tries",
 * higher-is-better for "score". Omit `raw` for "reward" (not ranked).
 */
export interface GameResult {
  kind: ResultKind;
  display: string;
  raw?: number;
}

/** A friend's play of a given game today. `playedAt` is relative, e.g. "pre 2h". */
export interface FriendPlay {
  handle: string;
  name: string;
  result: GameResult;
  playedAt: string;
}

/** Per-game streak state for the current user. */
export interface GameStreak {
  current: number;
  best: number;
  playedToday: boolean;
}

/**
 * Static, presentational metadata for one game card.
 *
 * `icon` is an Icon sprite name; `accent` maps to a brand color; `metricLabel`
 * is the short Serbian label for the comparison metric (e.g. "Rezultat",
 * "Vreme", "Pokušaji", "Nagrada", "Greške").
 */
export interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  icon: string;
  accent: "lemon" | "violet" | "green" | "cyan";
  metricLabel: string;
}

/**
 * The contract every game component implements (Phase 3).
 *
 * Each game is a self-contained modal overlay: it renders its own fixed overlay
 * + dialog when `open`, calls `onClose` to dismiss, and calls `onComplete` with
 * its {@link GameResult} when the player finishes (so the hub can record the
 * result and streak).
 */
export interface GameModalProps {
  open: boolean;
  onClose: () => void;
  onComplete?: (r: GameResult) => void;
}

/**
 * Local YYYY-MM-DD for "today" — the daily seed component.
 *
 * Combine with a game id to seed a deterministic daily puzzle, e.g.
 * `makeRng("kodword-" + todayKey())`. Same calendar day => same key => same
 * puzzle for everyone.
 */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
