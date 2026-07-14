"use client";

/**
 * GrupeGame — "Grupe" (NYT-Connections clone) for the tikimiki GameHub.
 *
 * A 4×4 grid of 16 dev terms hiding 4 groups of 4. Pick the day's puzzle
 * (categories, members, shuffled tile positions) deterministically from
 * `makeRng("grupe-" + todayKey())`, so the puzzle is identical for everyone on a
 * given calendar day and stable across SSR/CSR.
 *
 * Rules: select up to 4 tiles, submit a guess. A correct group locks into a
 * colored, labelled row; a wrong guess shakes, costs a life, and shows a "fali ti
 * jedan" (one away) hint when 3 of 4 are correct. Win on 4 groups found, lose at
 * 4 mistakes — then every group is revealed. Reports
 * `onComplete({ kind:"score", display: solved+"/4", raw: solved })` once and
 * shows a friends-comparison (FRIEND_PLAYS.grupe — groups solved / mistakes)
 * before closing.
 *
 * Self-contained modal: renders nothing when `!open`; otherwise its own fixed
 * overlay + centered dialog (close via X / backdrop / ESC). Tokens only, no
 * emoji (Icon sprite), all copy Serbian (Latin), data layer mono + tabular.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { makeRng } from "@/lib/avatars/core";
import { FRIEND_PLAYS, STREAKS } from "@/lib/gamehub/mock";
import type { FriendPlay, GameModalProps, GameResult } from "@/lib/gamehub/types";
import { todayKey } from "@/lib/gamehub/types";
import { useT } from "@/components/i18n/LanguageProvider";

/* UI chrome strings (category labels + member terms stay Serbian). */
const M = {
  close: { en: "Close", sr: "Zatvori" },
  dialogAria: { en: "Groups — daily game", sr: "Grupe — dnevna igra" },
  gameName: { en: "Groups", sr: "Grupe" },
  subtitle: {
    en: "Connect 16 terms into 4 hidden groups",
    sr: "Poveži 16 pojmova u 4 skrivene grupe",
  },
  mistakes: { en: "Mistakes", sr: "Greške" },
  livesAria: { en: "Lives remaining: {n}", sr: "Preostalo života: {n}" },
  resultWon: { en: "All groups solved!", sr: "Sve grupe rešene!" },
  resultLost: { en: "No attempts left", sr: "Nema više pokušaja" },
  solvedGroups: { en: "Solved groups", sr: "Rešene grupe" },
  oneAway: { en: "One away!", sr: "Fali ti jedan!" },
  selected: { en: "Selected", sr: "Izabrano" },
  shuffle: { en: "Shuffle", sr: "Promešaj" },
  deselect: { en: "Deselect", sr: "Poništi" },
  submit: { en: "Submit", sr: "Pošalji" },
  friendsToday: { en: "Friends today", sr: "Prijatelji danas" },
  yourStreak: { en: "Your streak", sr: "Tvoj niz" },
  backToHub: { en: "Back to GameHub", sr: "Nazad na GameHub" },
  // mistake count pluralization
  mistakes1: { en: "1 mistake", sr: "1 greška" },
  mistakesFew: { en: "{n} mistakes", sr: "{n} greške" },
  mistakesMany: { en: "{n} mistakes", sr: "{n} grešaka" },
} as const;

/* Category bank
   Each category = a Serbian label + exactly four dev terms. The day's puzzle
   draws four distinct categories from this bank (deterministically). Members
   are short so tiles stay legible on the 4×4 grid. */
interface CategorySpec {
  key: string;
  label: string;
  members: [string, string, string, string];
}

const CATEGORY_BANK: readonly CategorySpec[] = [
  { key: "jezici", label: "Programski jezici", members: ["Python", "Rust", "Go", "Java"] },
  { key: "baze", label: "Baze podataka", members: ["Postgres", "Redis", "Mongo", "SQLite"] },
  { key: "frontend", label: "Frontend okviri", members: ["React", "Vue", "Svelte", "Angular"] },
  { key: "git", label: "Git komande", members: ["commit", "push", "merge", "rebase"] },
  { key: "http", label: "HTTP metode", members: ["GET", "POST", "PUT", "PATCH"] },
  { key: "oblaci", label: "Cloud provajderi", members: ["AWS", "Azure", "GCP", "Vercel"] },
  {
    key: "kontejneri",
    label: "DevOps alati",
    members: ["Docker", "Kubernetes", "Terraform", "Ansible"],
  },
  { key: "status", label: "HTTP statusi", members: ["200", "301", "404", "500"] },
  { key: "tipovi", label: "Tipovi podataka", members: ["string", "boolean", "array", "object"] },
  { key: "linux", label: "Linux komande", members: ["grep", "chmod", "kill", "sudo"] },
  { key: "stilovi", label: "CSS layout", members: ["flex", "grid", "block", "inline"] },
  {
    key: "metodologije",
    label: "Agilni pojmovi",
    members: ["Sprint", "Backlog", "Scrum", "Standup"],
  },
];

/* Four distinct, on-brand row tints (solved groups)
   Order = difficulty-ish color rank, same idea as the original NYT palette but
   on the Midnight Voltage tokens. */
const ROW_TINTS = ["lemon", "green", "violet", "cyan"] as const;
type RowTint = (typeof ROW_TINTS)[number];

interface DailyPuzzle {
  /** the four chosen categories, in fixed (color) order */
  groups: { spec: CategorySpec; tint: RowTint }[];
  /** 16 tiles in their shuffled board order */
  board: { term: string; groupKey: string }[];
}

/** Build today's puzzle deterministically from the date seed. */
function buildPuzzle(seed: string): DailyPuzzle {
  const rng = makeRng(seed);

  // Deterministic Fisher–Yates over a copy of the bank, take the first four.
  const pool = CATEGORY_BANK.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, 4);

  const groups = chosen.map((spec, idx) => ({ spec, tint: ROW_TINTS[idx] }));

  // Flatten all 16 members, then deterministically shuffle their board order.
  const board = groups.flatMap((g) =>
    g.spec.members.map((term) => ({ term, groupKey: g.spec.key })),
  );
  for (let i = board.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [board[i], board[j]] = [board[j], board[i]];
  }

  return { groups, board };
}

const MAX_LIVES = 4;
const GROUP_SIZE = 4;

type Phase = "play" | "won" | "lost";

/* Friend comparison ranking (grupe = fewer mistakes is better) */
function rankPlays(plays: readonly FriendPlay[]): FriendPlay[] {
  return plays.slice().sort((a, b) => (a.result.raw ?? Infinity) - (b.result.raw ?? Infinity));
}

/** Pluralization for the mistake count (Serbian: greška / greške / grešaka). */
function mistakesLabel(n: number, t: (k: keyof typeof M) => string): string {
  if (n === 1) return t("mistakes1");
  if (n >= 2 && n <= 4) return t("mistakesFew").replace("{n}", String(n));
  return t("mistakesMany").replace("{n}", String(n));
}

export function GrupeGame({ open, onClose, onComplete }: GameModalProps) {
  const t = useT(M);
  const seed = useMemo(() => "grupe-" + todayKey(), []);
  const puzzle = useMemo(() => buildPuzzle(seed), [seed]);

  // Tint lookup by group key (for solved-row coloring).
  const tintOf = useMemo(() => {
    const m: Record<string, { tint: RowTint; label: string }> = {};
    for (const g of puzzle.groups) m[g.spec.key] = { tint: g.tint, label: g.spec.label };
    return m;
  }, [puzzle]);

  const [selected, setSelected] = useState<string[]>([]); // selected terms
  const [solvedKeys, setSolvedKeys] = useState<string[]>([]); // solved group keys, in solve order
  const [mistakes, setMistakes] = useState(0);
  const [phase, setPhase] = useState<Phase>("play");
  const [shaking, setShaking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const completedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const solvedCount = solvedKeys.length;

  // Terms still on the board (not yet solved), kept in the puzzle's board order.
  const remaining = useMemo(
    () => puzzle.board.filter((t) => !solvedKeys.includes(t.groupKey)),
    [puzzle.board, solvedKeys],
  );

  // Group-key -> its four terms (for reveal + solved rows).
  const groupTerms = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const g of puzzle.groups) m[g.spec.key] = g.spec.members.slice();
    return m;
  }, [puzzle]);

  /* Lifecycle: reset transient state whenever the modal (re)opens */
  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setSolvedKeys([]);
    setMistakes(0);
    setPhase("play");
    setShaking(false);
    setHint(null);
    setShowResult(false);
    completedRef.current = false;
  }, [open, seed]);

  /* Finish: fire onComplete exactly once, then flip to the result screen.
     `perfect` marks a flawless win (all 4 groups, zero mistakes) — the backend
     awards the "Grupe bez greške" badge only for perfect === true. */
  const finish = useCallback(
    (solved: number, perfect = false) => {
      if (!completedRef.current) {
        completedRef.current = true;
        const result: GameResult = {
          kind: "score",
          display: `${solved}/4`,
          raw: solved,
          perfect,
        };
        onComplete?.(result);
      }
      setShowResult(true);
    },
    [onComplete],
  );

  const toggleTile = useCallback(
    (term: string) => {
      if (phase !== "play") return;
      setHint(null);
      setSelected((prev) => {
        if (prev.includes(term)) return prev.filter((t) => t !== term);
        if (prev.length >= GROUP_SIZE) return prev; // cap at 4
        return [...prev, term];
      });
    },
    [phase],
  );

  const submitGuess = useCallback(() => {
    if (phase !== "play" || selected.length !== GROUP_SIZE) return;

    // Which group does each selected term belong to?
    const keyByTerm: Record<string, string> = {};
    for (const t of puzzle.board) keyByTerm[t.term] = t.groupKey;

    const counts: Record<string, number> = {};
    for (const term of selected) {
      const k = keyByTerm[term];
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const best = Math.max(...Object.values(counts));
    const matchedKey = Object.keys(counts).find((k) => counts[k] === GROUP_SIZE);

    if (matchedKey) {
      // Correct group.
      const nextSolved = [...solvedKeys, matchedKey];
      setSolvedKeys(nextSolved);
      setSelected([]);
      setHint(null);
      if (nextSolved.length === 4) {
        setPhase("won");
        finish(4, mistakes === 0);
      }
    } else {
      // Wrong group: shake, spend a life, "one away" if 3/4 belong together.
      const nextMistakes = mistakes + 1;
      setMistakes(nextMistakes);
      setShaking(true);
      window.setTimeout(() => setShaking(false), 480);
      setHint(best === GROUP_SIZE - 1 ? t("oneAway") : null);
      if (nextMistakes >= MAX_LIVES) {
        // Lose: reveal everything, lock the board.
        setSelected([]);
        setPhase("lost");
        // Reveal all unsolved groups (board renders the reveal from phase).
        finish(solvedKeys.length);
      }
    }
  }, [phase, selected, puzzle.board, solvedKeys, mistakes, finish, t]);

  // An ever-incrementing nonce drives a fresh deterministic shuffle without touching the daily seed.
  const [shuffleNonce, setShuffleNonce] = useState(0);

  const shuffleRemaining = useCallback(() => {
    if (phase !== "play") return;
    // Visual reshuffle of remaining tiles — uses an ephemeral, non-daily order.
    setHint(null);
    setSelected([]);
    setShuffleNonce((n) => n + 1);
  }, [phase]);

  const displayTiles = useMemo(() => {
    if (shuffleNonce === 0) return remaining;
    const arr = remaining.slice();
    // Deterministic-but-changing reshuffle so React keys stay stable per nonce.
    const rng = makeRng(seed + "-shuffle-" + shuffleNonce);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [remaining, shuffleNonce, seed]);

  const deselectAll = useCallback(() => {
    if (phase !== "play") return;
    setSelected([]);
    setHint(null);
  }, [phase]);

  /* ESC to close */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Focus the dialog on open (accessibility) */
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const streak = STREAKS.grupe;
  const friendPlays = rankPlays(FRIEND_PLAYS.grupe);

  // Solved rows render in solve order; on loss, unsolved groups are appended
  // in their canonical (color) order as a reveal.
  const revealOrder: string[] =
    phase === "lost"
      ? [
          ...solvedKeys,
          ...puzzle.groups.map((g) => g.spec.key).filter((k) => !solvedKeys.includes(k)),
        ]
      : solvedKeys;

  return (
    <div
      className="gm-overlay open"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{GRUPE_CSS}</style>
      <div
        className="gm-dialog grp-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogAria")}
        tabIndex={-1}
        ref={dialogRef}
      >
        <button type="button" className="gm-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="x" />
        </button>

        {/* Header */}
        <header className="grp-head">
          <span className="grp-glyph" aria-hidden="true">
            <Icon name="sparkles" />
          </span>
          <div className="grp-titles">
            <h2 className="grp-title">{t("gameName")}</h2>
            <p className="grp-sub">{t("subtitle")}</p>
          </div>
          {!showResult && (
            <div
              className="grp-lives"
              aria-label={t("livesAria").replace("{n}", String(MAX_LIVES - mistakes))}
            >
              <span className="grp-lives-label">{t("mistakes")}</span>
              <span className="grp-dots">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <span
                    key={i}
                    className={"grp-dot" + (i < mistakes ? " is-spent" : "")}
                    aria-hidden="true"
                  />
                ))}
              </span>
            </div>
          )}
        </header>

        {showResult ? (
          /* Result screen */
          <div className="grp-result">
            <div className={"grp-result-badge grp-" + (phase === "won" ? "won" : "lost")}>
              <Icon name={phase === "won" ? "trophy" : "x"} />
            </div>
            <h3 className="grp-result-title">
              {phase === "won" ? t("resultWon") : t("resultLost")}
            </h3>
            <p className="grp-result-line">
              {t("solvedGroups")} <span className="u-mono grp-strong">{solvedCount}/4</span>
              <span className="grp-result-dot" aria-hidden="true">
                ·
              </span>
              <span className="u-mono">{mistakesLabel(mistakes, t)}</span>
            </p>

            {/* Revealed groups (always show the full solution) */}
            <div className="grp-reveal">
              {puzzle.groups.map((g) => (
                <div key={g.spec.key} className={"grp-reveal-row grp-tint-" + g.tint}>
                  <span className="grp-reveal-label">{g.spec.label}</span>
                  <span className="grp-reveal-members u-mono">{g.spec.members.join(" · ")}</span>
                </div>
              ))}
            </div>

            {/* Friend comparison */}
            <div className="grp-friends">
              <div className="grp-friends-head">
                <Icon name="award" />
                <span>{t("friendsToday")}</span>
                <span className="grp-streak-chip u-mono" title={t("yourStreak")}>
                  <Icon name="flame" />
                  {streak.current}
                </span>
              </div>
              <ul className="grp-friends-list">
                {friendPlays.map((p, i) => (
                  <li key={p.handle} className="grp-friend-row">
                    <span className="grp-rank u-mono">{i + 1}</span>
                    <span className="grp-friend-av" aria-hidden="true">
                      <GenerativeAvatar seed={p.handle} variant="orbit" size={32} />
                    </span>
                    <span className="grp-friend-info">
                      <span className="grp-friend-name">{p.name}</span>
                      <span className="grp-friend-meta">{p.playedAt}</span>
                    </span>
                    <span className="grp-friend-score u-mono">{p.result.display}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button type="button" className="btn btn-primary grp-result-btn" onClick={onClose}>
              {t("backToHub")}
            </button>
          </div>
        ) : (
          /* Play screen */
          <div className="grp-play">
            {/* Solved rows (and, on loss, the revealed remainder) */}
            {revealOrder.length > 0 && (
              <div className="grp-solved">
                {revealOrder.map((key) => {
                  const info = tintOf[key];
                  const wasSolved = solvedKeys.includes(key);
                  return (
                    <div
                      key={key}
                      className={
                        "grp-solved-row grp-tint-" + info.tint + (wasSolved ? "" : " is-revealed")
                      }
                    >
                      <span className="grp-solved-label">{info.label}</span>
                      <span className="grp-solved-members u-mono">
                        {groupTerms[key].join(" · ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* The remaining tile grid */}
            <div className={"grp-grid" + (shaking ? " is-shaking" : "")}>
              {displayTiles.map((t) => {
                const isSel = selected.includes(t.term);
                return (
                  <button
                    key={t.term}
                    type="button"
                    className={"grp-tile" + (isSel ? " is-selected" : "")}
                    onClick={() => toggleTile(t.term)}
                    aria-pressed={isSel}
                    disabled={phase !== "play"}
                  >
                    {t.term}
                  </button>
                );
              })}
            </div>

            {/* Hint + selection count */}
            <div className="grp-status" aria-live="polite">
              {hint ? (
                <span className="grp-hint">
                  <Icon name="zap" />
                  {hint}
                </span>
              ) : (
                <span className="grp-count u-mono">
                  {t("selected")} {selected.length}/{GROUP_SIZE}
                </span>
              )}
            </div>

            {/* Controls */}
            <div className="grp-controls">
              <button
                type="button"
                className="btn btn-ghost grp-ctrl"
                onClick={shuffleRemaining}
                disabled={phase !== "play"}
              >
                {t("shuffle")}
              </button>
              <button
                type="button"
                className="btn btn-ghost grp-ctrl"
                onClick={deselectAll}
                disabled={phase !== "play" || selected.length === 0}
              >
                {t("deselect")}
              </button>
              <button
                type="button"
                className="btn btn-primary grp-ctrl grp-submit"
                onClick={submitGuess}
                disabled={phase !== "play" || selected.length !== GROUP_SIZE}
              >
                {t("submit")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GrupeGame;

/* Scoped styles
   Injected via <style> (the component owns no entry in the shared gamehub.css).
   All values are design tokens; the four solved-row tints map to brand colors.
   Mono + tabular for every data-layer number (selection count, scores, streak). */
const GRUPE_CSS = `
.grp-dialog{ width:560px; max-width:100%; padding:0; }
.grp-tint-lemon{ --grp-c:var(--lemon-vivid); --grp-bg:rgba(236,226,58,.14); --grp-bd:rgba(236,226,58,.4); }
.grp-tint-green{ --grp-c:var(--green); --grp-bg:rgba(79,216,166,.14); --grp-bd:rgba(79,216,166,.42); }
.grp-tint-violet{ --grp-c:var(--violet-light); --grp-bg:rgba(180,155,255,.14); --grp-bd:rgba(180,155,255,.42); }
.grp-tint-cyan{ --grp-c:#7DF9FF; --grp-bg:rgba(125,249,255,.12); --grp-bd:rgba(125,249,255,.38); }

/* Header */
.grp-head{ display:flex; align-items:center; gap:13px; padding:20px 56px 16px 22px; border-bottom:1px solid var(--line-soft); }
.grp-glyph{ width:44px; height:44px; border-radius:13px; flex-shrink:0; display:grid; place-items:center; color:var(--green); background:rgba(79,216,166,.12); border:1px solid rgba(79,216,166,.35); }
.grp-glyph .ic{ width:22px; height:22px; }
.grp-titles{ flex:1; min-width:0; }
.grp-title{ font-family:var(--display); font-weight:800; font-size:22px; letter-spacing:-.025em; color:var(--ink); line-height:1.1; }
.grp-sub{ font-size:12.5px; color:var(--muted); margin-top:2px; }
.grp-lives{ display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0; }
.grp-lives-label{ font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.grp-dots{ display:inline-flex; gap:6px; }
.grp-dot{ width:11px; height:11px; border-radius:50%; background:var(--green); border:1px solid transparent; box-shadow:0 0 7px -1px var(--green); transition:background var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out); }
.grp-dot.is-spent{ background:var(--surface-3); border-color:var(--line); box-shadow:none; transform:scale(.82); }

/* Play area */
.grp-play{ padding:16px 22px 22px; }

/* Solved + revealed rows */
.grp-solved{ display:flex; flex-direction:column; gap:8px; margin-bottom:10px; }
.grp-solved-row{ display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 12px; border-radius:var(--r-sm); background:var(--grp-bg); border:1px solid var(--grp-bd); text-align:center; animation:grp-lock .4s var(--ease-quint) both; }
.grp-solved-row.is-revealed{ opacity:.85; }
@keyframes grp-lock{ from{ opacity:0; transform:scale(.96) translateY(-4px); } to{ opacity:1; transform:none; } }
.grp-solved-label{ font-family:var(--display); font-weight:800; font-size:13.5px; letter-spacing:.01em; color:var(--grp-c); text-transform:uppercase; }
.grp-solved-members{ font-size:13px; color:var(--ink); font-weight:600; }

/* Tile grid */
.grp-grid{ display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px; }
.grp-grid.is-shaking{ animation:grp-shake .46s var(--ease-out); }
@keyframes grp-shake{ 10%,90%{ transform:translateX(-2px);} 20%,80%{ transform:translateX(4px);} 30%,50%,70%{ transform:translateX(-7px);} 40%,60%{ transform:translateX(7px);} }
.grp-tile{ position:relative; min-height:62px; padding:6px 4px; border-radius:var(--r-sm); display:flex; align-items:center; justify-content:center; text-align:center; font-family:var(--body); font-weight:700; font-size:14px; line-height:1.15; color:var(--ink); background:var(--surface-3); border:1px solid var(--line); transition:background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out), transform var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out); word-break:break-word; }
.grp-tile:hover:not(:disabled){ border-color:var(--violet-light); transform:translateY(-2px); }
.grp-tile:active:not(:disabled){ transform:scale(.96); }
.grp-tile.is-selected{ background:var(--violet); color:var(--lemon); border-color:var(--violet-light); box-shadow:var(--glow-violet); }
.grp-tile:disabled{ cursor:default; opacity:.55; }

/* Hint / count */
.grp-status{ min-height:24px; display:flex; align-items:center; justify-content:center; margin:14px 0 12px; }
.grp-count{ font-size:12.5px; color:var(--muted); font-variant-numeric:tabular-nums; }
.grp-hint{ display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:var(--warning); background:rgba(247,178,59,.12); border:1px solid rgba(247,178,59,.34); padding:4px 12px; border-radius:var(--r-pill); animation:grp-pop .3s var(--ease-quint) both; }
.grp-hint .ic{ width:14px; height:14px; }
@keyframes grp-pop{ from{ opacity:0; transform:scale(.9);} to{ opacity:1; transform:none; } }

/* Controls */
.grp-controls{ display:flex; gap:10px; }
.grp-ctrl{ flex:1; padding:11px 14px; }
.grp-submit{ flex:1.4; }

/* Result screen */
.grp-result{ padding:22px 22px 22px; display:flex; flex-direction:column; align-items:center; text-align:center; }
.grp-result-badge{ width:56px; height:56px; border-radius:16px; display:grid; place-items:center; margin-bottom:12px; }
.grp-result-badge .ic{ width:28px; height:28px; }
.grp-result-badge.grp-won{ color:var(--lemon-vivid); background:rgba(236,226,58,.12); border:1px solid rgba(236,226,58,.36); box-shadow:var(--glow-lemon); }
.grp-result-badge.grp-lost{ color:var(--red); background:rgba(251,111,111,.1); border:1px solid rgba(251,111,111,.32); }
.grp-result-title{ font-family:var(--display); font-weight:800; font-size:22px; letter-spacing:-.025em; color:var(--ink); }
.grp-result-line{ font-size:13.5px; color:var(--muted); margin-top:6px; display:flex; align-items:center; gap:8px; }
.grp-result-line .u-mono{ color:var(--ink-2); }
.grp-strong{ color:var(--green) !important; font-weight:700; }
.grp-result-dot{ color:var(--line); }

/* Revealed solution */
.grp-reveal{ width:100%; display:flex; flex-direction:column; gap:7px; margin:16px 0 4px; }
.grp-reveal-row{ display:flex; flex-direction:column; gap:2px; padding:9px 12px; border-radius:var(--r-sm); background:var(--grp-bg); border:1px solid var(--grp-bd); text-align:left; }
.grp-reveal-label{ font-family:var(--display); font-weight:800; font-size:12px; letter-spacing:.02em; text-transform:uppercase; color:var(--grp-c); }
.grp-reveal-members{ font-size:13px; color:var(--ink); font-weight:600; }

/* Friend comparison */
.grp-friends{ width:100%; margin-top:18px; border:1px solid var(--line); border-radius:var(--r-md); background:rgba(21,17,44,.5); overflow:hidden; }
.grp-friends-head{ display:flex; align-items:center; gap:8px; padding:11px 14px; border-bottom:1px solid var(--line-soft); font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
.grp-friends-head .ic{ width:15px; height:15px; color:var(--violet-light); }
.grp-streak-chip{ margin-left:auto; display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:var(--r-pill); background:rgba(236,226,58,.1); border:1px solid rgba(236,226,58,.3); color:var(--lemon-vivid); font-weight:700; font-size:12px; letter-spacing:-.02em; text-transform:none; }
.grp-streak-chip .ic{ width:12px; height:12px; color:var(--lemon-vivid); }
.grp-friends-list{ list-style:none; display:flex; flex-direction:column; }
.grp-friend-row{ display:flex; align-items:center; gap:11px; padding:9px 14px; }
.grp-friend-row + .grp-friend-row{ border-top:1px solid var(--line-soft); }
.grp-rank{ width:18px; text-align:center; font-size:12.5px; font-weight:700; color:var(--muted); flex-shrink:0; }
.grp-friend-av{ width:32px; height:32px; border-radius:50%; overflow:hidden; flex-shrink:0; border:1px solid var(--line); display:block; }
.grp-friend-av :is(svg){ display:block; width:100%; height:100%; }
.grp-friend-info{ flex:1; min-width:0; display:flex; flex-direction:column; line-height:1.25; text-align:left; }
.grp-friend-name{ font-size:13.5px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.grp-friend-meta{ font-size:11.5px; color:var(--muted); }
.grp-friend-score{ flex-shrink:0; font-size:13px; font-weight:700; color:var(--green); letter-spacing:-.02em; }
.grp-result-btn{ margin-top:18px; width:100%; }

@media (max-width:480px){
  .grp-tile{ min-height:54px; font-size:12.5px; }
  .grp-controls{ flex-wrap:wrap; }
}
@media (prefers-reduced-motion:reduce){
  .grp-grid.is-shaking{ animation:none; }
}
`;
