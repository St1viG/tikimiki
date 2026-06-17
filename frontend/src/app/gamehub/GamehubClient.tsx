"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { GameCard } from "@/components/gamehub/GameCard";
import { StreakBand } from "@/components/gamehub/StreakBand";
import { FriendsPanel } from "@/components/gamehub/FriendsPanel";
import { GAME_COMPONENTS } from "@/components/gamehub/registry";
import { GAMES } from "@/lib/gamehub/mock";
import type { GameId, GameResult, ResultKind } from "@/lib/gamehub/types";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";
import type { Game, GameTodayState } from "@/lib/api";

const M = {
  back: { en: "Back", sr: "Nazad" },
  sub: {
    en: "Daily games, streaks and a duel with friends",
    sr: "Dnevne igre, serije i duel sa prijateljima",
  },
  dailyGames: { en: "Daily games", sr: "Dnevne igre" },
  loading: { en: "Loading games…", sr: "Učitavanje igara…" },
  empty: { en: "No games available.", sr: "Nema dostupnih igara." },
} as const;

/**
 * Each GAMES card's `metricLabel` (Serbian) implies the result kind. We use it to
 * render a `display` string from the backend's numeric `bestScoreToday`
 * so an already-played card (loaded from the server) reads the same way a freshly
 * played one does — without touching GameCard, which only accepts a GameResult.
 */
const METRIC_KIND: Record<string, ResultKind> = {
  Nagrada: "reward",
  Rezultat: "score",
  Pokušaji: "tries",
  Greške: "tries",
  Vreme: "time",
};

/**
 * Map a game outcome to a meaningful XP reward, scaled by the game's
 * maxPointsPerPlay. The games report their *metric* (e.g. "4/5", "3/6 pokušaja",
 * "01:12", "+100 XP"); this converts that into points the backend awards:
 *  - reward (spin): the raw XP as-is
 *  - score  (x/y) : maxPts * x/y                  (higher is better)
 *  - tries  (x/y) : maxPts * (y-x+1)/y if solved  (fewer tries is better)
 *  - time   (secs): maxPts scaled, full under 30s → 0 by 180s
 */
function computePoints(result: GameResult, game: Game): number {
  const max = game.maxPointsPerPlay ?? 0;
  if (result.kind === "reward") return Math.max(0, Math.round(result.raw ?? 0));

  const frac = result.display.match(/(\d+)\s*\/\s*(\d+)/);
  if (result.kind === "score" && frac) {
    const got = Number(frac[1]);
    const total = Number(frac[2]) || 1;
    return Math.round(max * (got / total));
  }
  if (result.kind === "tries" && frac) {
    const used = Number(frac[1]);
    const total = Number(frac[2]) || 6;
    const solved = (result.raw ?? total + 1) <= total;
    return solved ? Math.round(max * ((total - used + 1) / total)) : 0;
  }
  if (result.kind === "time") {
    const secs = result.raw ?? 999;
    const factor = Math.max(0, Math.min(1, (180 - secs) / 150));
    return Math.round(max * factor);
  }
  return Math.max(0, Math.round(result.raw ?? 0));
}

/** Format a numeric best-score-today into the per-game display string. */
function displayFor(id: GameId, kind: ResultKind, raw: number): string {
  if (kind === "reward") return raw > 0 ? `+${raw} XP` : "Promašaj";
  if (kind === "score") return `${raw}/5`;
  if (kind === "tries") {
    if (id === "kodword") return `${raw}/6 pokušaja`;
    return raw === 1 ? "1 greška" : `${raw} grešaka`;
  }
  // time — seconds → mm:ss
  const m = String(Math.floor(raw / 60)).padStart(2, "0");
  const s = String(raw % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * GamehubClient — the interactive GameHub.
 *
 * Renders the AppShell (default 3-col variant) with the FriendsPanel right rail,
 * a page head, the StreakBand hero, and a responsive grid of GameCards (one per
 * GAMES entry). Holds the open-game state: `onPlay(id)` opens the matching
 * component from GAME_COMPONENTS as a modal; the modal closes via `onClose` and
 * reports its outcome via `onComplete`, which records the play to the backend.
 */
export function GamehubClient() {
  const { status } = useRequireAuth();
  const t = useT(M);
  const [openGame, setOpenGame] = useState<GameId | null>(null);
  // Results the user earns this session, keyed by game id. We keep just-played
  // results in local state for a nice UX: a finished game's card immediately
  // shows its result + bumps its streak chip even before the today refresh lands.
  const [freshResults, setFreshResults] = useState<
    Partial<Record<GameId, GameResult>>
  >({});

  // Live backend data: the game catalog and the current user's per-game state today.
  const [games, setGames] = useState<Game[]>([]);
  const [today, setToday] = useState<GameTodayState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [gameList, todayState] = await Promise.all([
          api.getGames(),
          api.getGamesToday(),
        ]);
        if (cancelled) return;
        setGames(gameList);
        setToday(todayState);
      } catch (err) {
        if (!cancelled) console.error("Failed to load games", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  /** slug → backend Game (gives us the gameId needed to record a play). */
  const gameBySlug = useMemo(() => {
    const m: Record<string, Game> = {};
    for (const g of games) m[g.slug] = g;
    return m;
  }, [games]);

  /** slug → today state (playsUsedToday / playedToday / bestScoreToday). */
  const todayBySlug = useMemo(() => {
    const m: Record<string, GameTodayState> = {};
    for (const s of today) m[s.slug] = s;
    return m;
  }, [today]);

  async function refreshToday() {
    try {
      const todayState = await api.getGamesToday();
      setToday(todayState);
    } catch (err) {
      console.error("Failed to refresh game state", err);
    }
  }

  function handlePlay(id: GameId) {
    setOpenGame(id);
  }

  function handleComplete(id: GameId, result: GameResult) {
    // Reflect the freshly-played result on the card immediately (optimistic).
    setFreshResults((prev) => ({ ...prev, [id]: result }));
    // Record the play against the backend, then refresh today state.
    const game = gameBySlug[id];
    if (!game) {
      console.error(`No backend game found for slug "${id}"`);
      return;
    }
    // Record the game's metric as the score (drives the card display) and the
    // scaled XP reward separately so the points awarded are meaningful.
    const metric = result.raw ?? 0;
    const points = computePoints(result, game);
    api
      .recordGamePlay(game.gameId, metric, points)
      .then(() => refreshToday())
      .catch((err) => {
        console.error("Failed to record game play", err);
        // Revert the optimistic card result on failure.
        setFreshResults((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });
  }

  /**
   * The card's today state. Prefer a result earned this session, else derive one
   * from the backend's per-game today state (playedToday + bestScoreToday). The
   * card maps this onto its existing "played / result" markup via `freshResult`.
   */
  function cardResult(card: (typeof GAMES)[number]): GameResult | undefined {
    if (freshResults[card.id]) return freshResults[card.id];
    const state = todayBySlug[card.id];
    if (!state || !state.playedToday) return undefined;
    const kind = METRIC_KIND[card.metricLabel] ?? "score";
    const raw = state.bestScoreToday ?? 0;
    return { kind, display: displayFor(card.id, kind, raw), raw };
  }

  const ActiveGame = openGame ? GAME_COMPONENTS[openGame] : null;

  return (
    <AppShell right={<FriendsPanel />}>
      <main className="gh-stack" id="main">
        <div className="page-head">
          <Link className="col-back" href="/" aria-label={t("back")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="gamehub" /> GameHub
            </h1>
            <p className="page-sub">{t("sub")}</p>
          </div>
        </div>

        <StreakBand />

        <section className="gh-games" aria-label={t("dailyGames")}>
          {loading ? (
            <div className="gh-games-grid">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <article className="gc" key={i} aria-busy="true">
                  {/* Header: icon tile + title/tagline */}
                  <header className="gc-head">
                    <span
                      className="skel"
                      aria-hidden="true"
                      style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0 }}
                    />
                    <div className="gc-titles" aria-hidden="true">
                      <span className="skel skel-line" style={{ width: "65%" }} />
                      <span
                        className="skel skel-line"
                        style={{ width: "40%", marginTop: 6 }}
                      />
                    </div>
                  </header>

                  {/* Your today state: play button + metric */}
                  <div className="gc-today" aria-hidden="true">
                    <span
                      className="skel"
                      style={{ width: 92, height: 36, borderRadius: 11 }}
                    />
                    <span className="skel skel-line" style={{ width: "18%" }} />
                  </div>
                </article>
              ))}
            </div>
          ) : games.length === 0 ? (
            <p className="page-sub">{t("empty")}</p>
          ) : (
            <div className="gh-games-grid">
              {GAMES.map((game) => {
                const result = cardResult(game);
                return (
                  <GameCard
                    key={game.id}
                    game={game}
                    onPlay={handlePlay}
                    freshResult={result}
                    freshlyPlayed={Boolean(result)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </main>

      {ActiveGame && openGame && (
        <ActiveGame
          open
          onClose={() => setOpenGame(null)}
          onComplete={(r) => handleComplete(openGame, r)}
        />
      )}
    </AppShell>
  );
}

export default GamehubClient;
