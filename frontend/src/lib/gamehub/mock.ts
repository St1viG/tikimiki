/**
 * GameHub — read-only mock data for the daily-games hub.
 *
 * Dev-themed, Serbian (Latin) sample data typed against
 * src/lib/gamehub/types.ts. Drives the hub shell (cards, streak band, friends
 * panel) while real games and a backend land in later phases. Do not mutate.
 *
 * Games read their own slice here:
 *   FRIEND_PLAYS[id]  — friends' results for that game today
 *   STREAKS[id]       — the current user's streak + playedToday for that game
 *   TODAY_RESULTS[id] — the current user's own result today (if already played)
 */

import type { FriendPlay, GameId, GameMeta, GameResult, GameStreak } from "./types";

/** The real team + a few dev friends (handle -> display name). */
export const FRIENDS: { handle: string; name: string }[] = [
  { handle: "stiveng", name: "Stevan Gnjato" },
  { handle: "nenad", name: "Nenad Skoković" },
  { handle: "dimitrije", name: "Dimitrije Pešić" },
  { handle: "miki", name: "Miki" },
  { handle: "mara", name: "Mara" },
  { handle: "fenjer", name: "Fenjer" },
  { handle: "moljac", name: "Moljac" },
];

/** The five daily games, in hub display order. */
export const GAMES: GameMeta[] = [
  {
    id: "spin",
    name: "Daily Spin",
    tagline: "Okreni točak i osvoji nagradu",
    icon: "coin",
    accent: "lemon",
    metricLabel: "Nagrada",
  },
  {
    id: "quiz",
    name: "Dev Kviz",
    tagline: "Pet pitanja iz dev folklora",
    icon: "hackathon",
    accent: "violet",
    metricLabel: "Rezultat",
  },
  {
    id: "kodword",
    name: "Kodword",
    tagline: "Pogodi dnevni dev pojam",
    icon: "zap",
    accent: "lemon",
    metricLabel: "Pokušaji",
  },
  {
    id: "grupe",
    name: "Grupe",
    tagline: "Poveži 16 pojmova u 4 grupe",
    icon: "sparkles",
    accent: "green",
    metricLabel: "Greške",
  },
  {
    id: "tempo",
    name: "Tempo",
    tagline: "Brzina kucanja koda",
    icon: "rocket",
    accent: "cyan",
    metricLabel: "Vreme",
  },
];

/** The current user's per-game streak state. */
export const STREAKS: Record<GameId, GameStreak> = {
  spin: { current: 12, best: 21, playedToday: true },
  quiz: { current: 7, best: 14, playedToday: true },
  kodword: { current: 4, best: 9, playedToday: true },
  grupe: { current: 0, best: 6, playedToday: false },
  tempo: { current: 2, best: 5, playedToday: false },
};

/**
 * The current user's own result today, for games already played. Games with no
 * entry are unplayed today => their card shows the "Igraj" call to action.
 */
export const TODAY_RESULTS: Partial<Record<GameId, GameResult>> = {
  spin: { kind: "reward", display: "+100 XP" },
  quiz: { kind: "score", display: "4/5", raw: 4 },
  kodword: { kind: "tries", display: "3/6 pokušaja", raw: 3 },
  // grupe & tempo not played yet today.
};

/**
 * Friends' results for each game today (3–6 per game), with results realistic
 * for the game type: scores for quiz, tries for kodword, mistakes for grupe,
 * times for tempo, rewards for spin.
 */
export const FRIEND_PLAYS: Record<GameId, FriendPlay[]> = {
  spin: [
    {
      handle: "stiveng",
      name: "Stevan Gnjato",
      result: { kind: "reward", display: "Rare skin" },
      playedAt: "pre 1h",
    },
    {
      handle: "miki",
      name: "Miki",
      result: { kind: "reward", display: "+200 XP" },
      playedAt: "pre 2h",
    },
    {
      handle: "fenjer",
      name: "Fenjer",
      result: { kind: "reward", display: "+50 XP" },
      playedAt: "pre 3h",
    },
    {
      handle: "mara",
      name: "Mara",
      result: { kind: "reward", display: "Promašaj" },
      playedAt: "pre 5h",
    },
  ],
  quiz: [
    {
      handle: "nenad",
      name: "Nenad Skoković",
      result: { kind: "score", display: "5/5", raw: 5 },
      playedAt: "pre 40min",
    },
    {
      handle: "stiveng",
      name: "Stevan Gnjato",
      result: { kind: "score", display: "5/5", raw: 5 },
      playedAt: "pre 1h",
    },
    {
      handle: "dimitrije",
      name: "Dimitrije Pešić",
      result: { kind: "score", display: "4/5", raw: 4 },
      playedAt: "pre 2h",
    },
    {
      handle: "miki",
      name: "Miki",
      result: { kind: "score", display: "3/5", raw: 3 },
      playedAt: "pre 3h",
    },
    {
      handle: "moljac",
      name: "Moljac",
      result: { kind: "score", display: "2/5", raw: 2 },
      playedAt: "pre 4h",
    },
  ],
  kodword: [
    {
      handle: "dimitrije",
      name: "Dimitrije Pešić",
      result: { kind: "tries", display: "2/6 pokušaja", raw: 2 },
      playedAt: "pre 1h",
    },
    {
      handle: "stiveng",
      name: "Stevan Gnjato",
      result: { kind: "tries", display: "3/6 pokušaja", raw: 3 },
      playedAt: "pre 2h",
    },
    {
      handle: "fenjer",
      name: "Fenjer",
      result: { kind: "tries", display: "4/6 pokušaja", raw: 4 },
      playedAt: "pre 2h",
    },
    {
      handle: "mara",
      name: "Mara",
      result: { kind: "tries", display: "5/6 pokušaja", raw: 5 },
      playedAt: "pre 6h",
    },
  ],
  grupe: [
    {
      handle: "nenad",
      name: "Nenad Skoković",
      result: { kind: "tries", display: "0 grešaka", raw: 0 },
      playedAt: "pre 30min",
    },
    {
      handle: "miki",
      name: "Miki",
      result: { kind: "tries", display: "1 greška", raw: 1 },
      playedAt: "pre 2h",
    },
    {
      handle: "stiveng",
      name: "Stevan Gnjato",
      result: { kind: "tries", display: "2 greške", raw: 2 },
      playedAt: "pre 3h",
    },
    {
      handle: "moljac",
      name: "Moljac",
      result: { kind: "tries", display: "4 greške", raw: 4 },
      playedAt: "pre 5h",
    },
  ],
  tempo: [
    {
      handle: "stiveng",
      name: "Stevan Gnjato",
      result: { kind: "time", display: "00:48", raw: 48 },
      playedAt: "pre 1h",
    },
    {
      handle: "dimitrije",
      name: "Dimitrije Pešić",
      result: { kind: "time", display: "01:02", raw: 62 },
      playedAt: "pre 2h",
    },
    {
      handle: "nenad",
      name: "Nenad Skoković",
      result: { kind: "time", display: "01:12", raw: 72 },
      playedAt: "pre 2h",
    },
    {
      handle: "fenjer",
      name: "Fenjer",
      result: { kind: "time", display: "01:25", raw: 85 },
      playedAt: "pre 4h",
    },
    {
      handle: "mara",
      name: "Mara",
      result: { kind: "time", display: "01:40", raw: 100 },
      playedAt: "pre 5h",
    },
  ],
};

/** The current user's overall (cross-game) daily streak. */
export const OVERALL_STREAK: { current: number; best: number } = {
  current: 7,
  best: 21,
};

/** How many of the day's games the current user has completed (derived). */
export const PLAYED_TODAY: number = Object.keys(TODAY_RESULTS).length;

/** Total number of daily games (for the "X/N odigrano danas" indicator). */
export const TOTAL_GAMES: number = GAMES.length;

/**
 * Friends' overall progress today: how many of the day's games each has
 * completed, derived from FRIEND_PLAYS, plus a standout result for color.
 */
export interface FriendToday {
  handle: string;
  name: string;
  completed: number;
  standout?: GameResult;
}

export const FRIENDS_TODAY: FriendToday[] = FRIENDS.map((f) => {
  const plays = (Object.keys(FRIEND_PLAYS) as GameId[]).flatMap((gid) =>
    FRIEND_PLAYS[gid].filter((p) => p.handle === f.handle),
  );
  // Standout = the friend's best score-kind result, else their first play.
  const standout =
    plays
      .filter((p) => p.result.kind === "score")
      .sort((a, b) => (b.result.raw ?? 0) - (a.result.raw ?? 0))[0]?.result ?? plays[0]?.result;
  return {
    handle: f.handle,
    name: f.name,
    completed: plays.length,
    standout,
  };
})
  .filter((f) => f.completed > 0)
  .sort((a, b) => b.completed - a.completed);
