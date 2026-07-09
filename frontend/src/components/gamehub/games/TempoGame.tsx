"use client";

/**
 * TempoGame — daily speed code-typing game.
 *
 * The user retypes a deterministically chosen code snippet.
 * Timer starts on first keystroke; stops when the typed text
 * matches the target exactly.  Reports { kind:"time", ... }.
 *
 * Implements GameModalProps from "@/lib/gamehub/types".
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { makeRng } from "@/lib/avatars/core";
import { FRIEND_PLAYS, STREAKS } from "@/lib/gamehub/mock";
import type { FriendPlay, GameModalProps, GameResult } from "@/lib/gamehub/types";
import { todayKey } from "@/lib/gamehub/types";
import { useT } from "@/components/i18n/LanguageProvider";

/* UI chrome strings (code snippets stay as-is). */
const M = {
  close: { en: "Close", sr: "Zatvori" },
  dialogAria: { en: "Tempo — typing speed", sr: "Tempo — brzina kucanja" },
  inputAria: { en: "Type the code", sr: "Ukucaj kod" },
  startTyping: { en: "Start typing…", sr: "Počni da kucaš…" },
  timerHint: {
    en: "Timer starts on the first keystroke",
    sr: "Timer kreće na prvom pritisku tastera",
  },
  accuracy: { en: "accuracy", sr: "tačnost" },
  leaderboard: { en: "Leaderboard today", sr: "Rang lista danas" },
  you: { en: "You", sr: "Ti" },
  youBadge: { en: "you", sr: "ti" },
  justNow: { en: "just now", sr: "upravo" },
} as const;

/* Snippet pool */

interface Snippet {
  lang: string;
  label: string;
  code: string;
}

const SNIPPETS: Snippet[] = [
  {
    lang: "js",
    label: "debounce",
    code: `function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}`,
  },
  {
    lang: "js",
    label: "deep clone",
    code: `function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, deepClone(v)])
  );
}`,
  },
  {
    lang: "js",
    label: "flatten",
    code: `function flatten(arr, depth = Infinity) {
  return depth > 0
    ? arr.reduce((acc, val) =>
        acc.concat(Array.isArray(val) ? flatten(val, depth - 1) : val), [])
    : arr.slice();
}`,
  },
  {
    lang: "python",
    label: "binary search",
    code: `def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
  },
  {
    lang: "python",
    label: "memoize",
    code: `def memoize(fn):
    cache = {}
    def wrapper(*args):
        if args not in cache:
            cache[args] = fn(*args)
        return cache[args]
    return wrapper`,
  },
  {
    lang: "js",
    label: "memoize",
    code: `function memoize(fn) {
  const cache = new Map();
  return function (...args) {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn.apply(this, args));
    return cache.get(key);
  };
}`,
  },
  {
    lang: "js",
    label: "throttle",
    code: `function throttle(fn, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}`,
  },
  {
    lang: "python",
    label: "quicksort",
    code: `def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    mid = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + mid + quicksort(right)`,
  },
];

/* Helpers */

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function calcWpm(text: string, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const words = text.length / 5;
  const minutes = elapsedMs / 60000;
  return Math.round(words / minutes);
}

function calcAccuracy(target: string, typed: string): number {
  if (typed.length === 0) return 100;
  let correct = 0;
  const len = Math.max(target.length, typed.length);
  for (let i = 0; i < len; i++) {
    if (i < target.length && i < typed.length && target[i] === typed[i]) {
      correct++;
    }
  }
  return Math.round((correct / Math.max(target.length, typed.length)) * 100);
}

/* Per-character highlight types */

type CharState = "pending" | "correct" | "wrong" | "cursor";

interface CharInfo {
  char: string;
  state: CharState;
}

function buildCharMap(target: string, typed: string): CharInfo[] {
  return target.split("").map((ch, i) => {
    if (i > typed.length) return { char: ch, state: "pending" as CharState };
    if (i === typed.length) return { char: ch, state: "cursor" as CharState };
    return {
      char: ch,
      state: typed[i] === ch ? "correct" : ("wrong" as CharState),
    };
  });
}

/* Leaderboard entry (user + friends merged) */

interface LeaderEntry {
  handle: string;
  name: string;
  result: GameResult;
  playedAt: string;
  isYou: boolean;
}

/* Main component */

export function TempoGame({ open, onClose, onComplete }: GameModalProps) {
  const t = useT(M);
  /* daily snippet */
  const snippet = useMemo(() => {
    const rng = makeRng("tempo-" + todayKey());
    return rng.pick(SNIPPETS);
  }, []);

  const target = snippet.code;

  /* game phases: "idle" | "playing" | "done" */
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [typed, setTyped] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalMs, setFinalMs] = useState<number | null>(null);

  /* live timer tick */
  const rafRef = useRef<number | null>(null);
  const startMsRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (startMsRef.current !== null) {
      setElapsedMs(Date.now() - startMsRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  /* textarea ref for focus */
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* reset on open/close */
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setTyped("");
      startMsRef.current = null;
      setElapsedMs(0);
      setFinalMs(null);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      /* small delay so the enter animation plays before focus */
      const tid = setTimeout(() => taRef.current?.focus(), 160);
      return () => clearTimeout(tid);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  }, [open]);

  /* Escape to close */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  /* typing handler */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (phase === "done") return;

      const val = e.target.value;

      /* start timer on first keystroke */
      if (phase === "idle" && val.length > 0) {
        const now = Date.now();
        startMsRef.current = now;
        setPhase("playing");
        rafRef.current = requestAnimationFrame(tick);
      }

      setTyped(val);

      /* completion check */
      if (val === target) {
        const endMs = Date.now();
        const elapsed = startMsRef.current !== null ? endMs - startMsRef.current : 0;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        startMsRef.current = null;
        setFinalMs(elapsed);
        setElapsedMs(elapsed);
        setPhase("done");

        const elapsedSec = Math.round(elapsed / 1000);
        const result: GameResult = {
          kind: "time",
          display: fmtTime(elapsed),
          raw: elapsedSec,
        };
        onComplete?.(result);
      }
    },
    [phase, target, tick, onComplete],
  );

  /* derived display values */
  const displayTime = fmtTime(elapsedMs);
  const wpm =
    phase === "done" && finalMs !== null ? calcWpm(target, finalMs) : calcWpm(typed, elapsedMs);
  const accuracy = calcAccuracy(target, typed);
  const charMap = buildCharMap(target, typed);

  /* leaderboard (friends + you if done) */
  const leaderboard = useMemo((): LeaderEntry[] => {
    const friendEntries: LeaderEntry[] = FRIEND_PLAYS["tempo"].map((fp: FriendPlay) => ({
      ...fp,
      isYou: false,
    }));

    if (phase === "done" && finalMs !== null) {
      const elapsedSec = Math.round(finalMs / 1000);
      const youEntry: LeaderEntry = {
        handle: "you",
        name: t("you"),
        result: { kind: "time", display: fmtTime(finalMs), raw: elapsedSec },
        playedAt: t("justNow"),
        isYou: true,
      };
      return [...friendEntries, youEntry].sort((a, b) => (a.result.raw ?? 0) - (b.result.raw ?? 0));
    }

    return friendEntries.sort((a, b) => (a.result.raw ?? 0) - (b.result.raw ?? 0));
  }, [phase, finalMs, t]);

  /* streak info */
  const streak = STREAKS["tempo"];

  if (!open) return null;

  /* overlay click to close */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="gm-overlay tg-overlay" onClick={handleOverlayClick}>
      <div
        className="gm-dialog tg-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogAria")}
      >
        {/* accent bar via gm-dialog::before */}

        {/* close */}
        <button className="gm-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="x" />
        </button>

        {/* header */}
        <div className="tg-header">
          <div className="tg-header-left">
            <div className="tg-icon-tile">
              <Icon name="rocket" />
            </div>
            <div>
              <div className="tg-title">Tempo</div>
              <div className="tg-sub">
                {snippet.label}
                <span className="tg-lang-badge">{snippet.lang}</span>
              </div>
            </div>
          </div>
          <div className="tg-stats-row">
            <div className="tg-stat">
              <Icon name="clock" className="tg-stat-icon" />
              <span className="u-mono tnum tg-stat-val">{displayTime}</span>
            </div>
            <div className="tg-stat">
              <Icon name="zap" className="tg-stat-icon" />
              <span className="u-mono tnum tg-stat-val">{wpm}</span>
              <span className="tg-stat-label">WPM</span>
            </div>
            <div className="tg-stat">
              <Icon name="check" className="tg-stat-icon" />
              <span className="u-mono tnum tg-stat-val">{accuracy}%</span>
            </div>
          </div>
        </div>

        {/* body */}
        {phase !== "done" ? (
          <div className="tg-body">
            {/* target display */}
            <div className="tg-target" aria-hidden="true">
              <pre className="tg-pre">
                {charMap.map((ci, idx) => (
                  <span key={idx} className={`tg-ch tg-ch--${ci.state}`}>
                    {ci.char === "\n" ? (
                      <>
                        <br />
                        {ci.state === "cursor" && <span className="tg-cursor-line" />}
                      </>
                    ) : (
                      ci.char
                    )}
                  </span>
                ))}
                {/* cursor at end */}
                {typed.length === target.length && phase === "playing" && (
                  <span className="tg-ch tg-ch--cursor"> </span>
                )}
              </pre>
            </div>

            {/* invisible textarea overlay for input */}
            <textarea
              ref={taRef}
              className="tg-input"
              value={typed}
              onChange={handleChange}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              aria-label={t("inputAria")}
              placeholder={phase === "idle" ? t("startTyping") : undefined}
            />

            {phase === "idle" && (
              <div className="tg-hint">
                <Icon name="zap" className="tg-hint-icon" />
                {t("timerHint")}
              </div>
            )}
          </div>
        ) : (
          /* result + leaderboard */
          <div className="tg-result">
            {/* your score banner */}
            <div className="tg-result-banner">
              <div className="tg-result-trophy">
                <Icon name="trophy" />
              </div>
              <div className="tg-result-vals">
                <div className="tg-result-time u-mono tnum">
                  {finalMs !== null ? fmtTime(finalMs) : "--:--"}
                </div>
                <div className="tg-result-meta">
                  <span className="u-mono tnum">{wpm} WPM</span>
                  <span className="tg-result-dot" />
                  <span className="u-mono tnum">
                    {accuracy}% {t("accuracy")}
                  </span>
                </div>
              </div>
              {streak.current > 0 && (
                <div className="tg-result-streak">
                  <Icon name="flame" className="tg-streak-icon" />
                  <span className="u-mono tnum">{streak.current}</span>
                </div>
              )}
            </div>

            {/* leaderboard */}
            <div className="tg-lb">
              <div className="tg-lb-title">{t("leaderboard")}</div>
              <ol className="tg-lb-list">
                {leaderboard.map((entry, idx) => (
                  <li
                    key={entry.handle}
                    className={`tg-lb-row${entry.isYou ? " tg-lb-row--you" : ""}`}
                  >
                    <span className="tg-lb-rank u-mono tnum">{idx + 1}</span>
                    <span className="tg-lb-av" aria-hidden="true">
                      <GenerativeAvatar
                        seed={entry.isYou ? "you-tikimiki" : entry.handle}
                        variant="orbit"
                        size={30}
                      />
                    </span>
                    <span className="tg-lb-name">
                      {entry.name}
                      {entry.isYou && <span className="tg-lb-you-badge">{t("youBadge")}</span>}
                    </span>
                    <span className="tg-lb-time u-mono tnum">{entry.result.display}</span>
                    <span className="tg-lb-at">{entry.playedAt}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="tg-result-actions">
              <button className="btn btn-ghost tg-btn-close" onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{TEMPO_CSS}</style>
    </div>
  );
}

export default TempoGame;

/* Scoped styles
   All rules are prefixed tg- so they never collide with shared gm-/gh- classes.
   Uses only design-system tokens, never hardcoded brand colours. */

const TEMPO_CSS = `
/* dialog size override for tempo (wider + taller) */
.tg-dialog {
  width: 580px;
  max-width: 100%;
  max-height: min(88vh, 780px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.tg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid var(--line-soft);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.tg-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.tg-icon-tile {
  width: 42px; height: 42px;
  border-radius: 12px;
  flex-shrink: 0;
  display: grid; place-items: center;
  background: rgba(125,249,255,.1);
  border: 1px solid rgba(125,249,255,.28);
  color: #7DF9FF;
}
.tg-icon-tile .ic { width: 21px; height: 21px; }
.tg-title {
  font-family: var(--display);
  font-weight: 800;
  font-size: 20px;
  letter-spacing: -.025em;
  color: var(--ink);
  line-height: 1.1;
}
.tg-sub {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 2px;
}
.tg-lang-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: var(--r-pill);
  background: rgba(125,249,255,.1);
  border: 1px solid rgba(125,249,255,.25);
  color: #7DF9FF;
}
.tg-stats-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.tg-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tg-stat-icon {
  width: 13px; height: 13px;
  color: var(--muted);
}
.tg-stat-val {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: -.015em;
  min-width: 3ch;
  text-align: right;
}
.tg-stat-label {
  font-size: 10.5px;
  color: var(--muted);
  font-weight: 600;
}

/* Typing body */
.tg-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding: 20px 22px 16px;
  gap: 12px;
}

/* target highlight area */
.tg-target {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-3);
  padding: 14px 16px;
  position: relative;
  user-select: none;
  cursor: text;
}
.tg-target::-webkit-scrollbar { width: 5px; }
.tg-target::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }

.tg-pre {
  margin: 0;
  font-family: var(--mono);
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-all;
}

/* char states */
.tg-ch { position: relative; }
.tg-ch--correct { color: var(--green); }
.tg-ch--wrong {
  color: var(--red);
  background: rgba(255, 80, 80, .15);
  border-radius: 2px;
}
.tg-ch--pending { color: var(--ink-2); opacity: .55; }
.tg-ch--cursor {
  position: relative;
  color: var(--ink);
}
.tg-ch--cursor::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: var(--lemon-vivid);
  border-radius: 1px;
  animation: tg-blink .85s step-end infinite;
  box-shadow: 0 0 6px 1px rgba(236,226,58,.7);
}
.tg-cursor-line {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--lemon-vivid);
  border-radius: 1px;
  vertical-align: text-bottom;
  animation: tg-blink .85s step-end infinite;
  box-shadow: 0 0 6px 1px rgba(236,226,58,.7);
}
@keyframes tg-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* invisible input */
.tg-input {
  position: absolute;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  resize: none;
}

.tg-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
}
.tg-hint-icon {
  width: 13px; height: 13px;
  color: var(--lemon);
  flex-shrink: 0;
}

/* Result screen */
.tg-result {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  flex: 1;
}

.tg-result-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px 18px;
  border-bottom: 1px solid var(--line-soft);
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(125,249,255,.06), transparent 60%);
}
.tg-result-trophy {
  width: 50px; height: 50px;
  flex-shrink: 0;
  border-radius: 14px;
  display: grid; place-items: center;
  background: rgba(125,249,255,.1);
  border: 1px solid rgba(125,249,255,.28);
  color: #7DF9FF;
}
.tg-result-trophy .ic { width: 26px; height: 26px; }

.tg-result-vals { flex: 1; min-width: 0; }
.tg-result-time {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -.04em;
  color: #7DF9FF;
  line-height: 1;
  text-shadow: 0 0 20px rgba(125,249,255,.35);
}
.tg-result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-2);
}
.tg-result-dot {
  width: 3px; height: 3px;
  border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;
}

.tg-result-streak {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: var(--r-pill);
  background: rgba(236,226,58,.1);
  border: 1px solid rgba(236,226,58,.3);
  color: var(--lemon-vivid);
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
}
.tg-streak-icon { width: 14px; height: 14px; }

/* leaderboard */
.tg-lb {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.tg-lb::-webkit-scrollbar { width: 5px; }
.tg-lb::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }

.tg-lb-title {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 14px 22px 8px;
}
.tg-lb-list {
  list-style: none;
  margin: 0;
  padding: 0 0 8px;
}
.tg-lb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 22px;
  transition: background .12s var(--ease-out);
}
.tg-lb-row + .tg-lb-row { border-top: 1px solid var(--line-soft); }
.tg-lb-row:hover { background: var(--surface-2); }
.tg-lb-row--you {
  background: rgba(125,249,255,.06);
  border-top: 1px solid rgba(125,249,255,.15) !important;
  border-bottom: 1px solid rgba(125,249,255,.15);
}

.tg-lb-rank {
  width: 22px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  text-align: right;
  flex-shrink: 0;
}
.tg-lb-row:nth-child(1) .tg-lb-rank { color: var(--lemon-vivid); }
.tg-lb-row:nth-child(2) .tg-lb-rank { color: var(--ink-2); }
.tg-lb-row:nth-child(3) .tg-lb-rank { color: var(--ink-2); }

.tg-lb-av {
  width: 30px; height: 30px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--line);
  display: block;
}
.tg-lb-av svg { display: block; width: 100%; height: 100%; }

.tg-lb-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tg-lb-row--you .tg-lb-name { color: #7DF9FF; }

.tg-lb-you-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: var(--r-pill);
  background: rgba(125,249,255,.14);
  border: 1px solid rgba(125,249,255,.3);
  color: #7DF9FF;
  flex-shrink: 0;
}

.tg-lb-time {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: -.015em;
  flex-shrink: 0;
}
.tg-lb-row--you .tg-lb-time { color: #7DF9FF; }
.tg-lb-row:nth-child(1) .tg-lb-time { color: var(--lemon-vivid); }

.tg-lb-at {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
  min-width: 52px;
  text-align: right;
}

/* close button row */
.tg-result-actions {
  display: flex;
  justify-content: flex-end;
  padding: 12px 22px 18px;
  flex-shrink: 0;
  border-top: 1px solid var(--line-soft);
}
.tg-btn-close {
  font-size: 13px;
  padding: 8px 20px;
}

/* Responsive */
@media (max-width: 600px) {
  .tg-dialog { width: 100%; max-height: 100dvh; border-radius: 0; }
  .tg-overlay { padding: 0; align-items: flex-end; }
  .tg-result-time { font-size: 26px; }
  .tg-stats-row { gap: 10px; }
}
`;
