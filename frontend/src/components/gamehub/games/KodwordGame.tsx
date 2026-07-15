"use client";

/**
 * Kodword — a daily Wordle clone for a 5-letter DEV term (GameHub Phase 3).
 *
 * Self-contained modal implementing {@link GameModalProps}: own fixed overlay +
 * dialog, X / backdrop / Escape close, scale/opacity transition on open. Six
 * guesses of the day's 5-letter programming word, chosen deterministically from
 * a curated list via makeRng("kodword-" + todayKey()) so the puzzle is stable
 * across SSR/CSR and identical for everyone that calendar day.
 *
 * Tiles flip green (correct spot) / lemon (present, wrong spot) / muted
 * (absent), the on-screen QWERTY keyboard mirrors the discovered key states, and
 * physical keyboard input is captured while open. On win or after six tries it
 * reveals the word, calls onComplete({ kind:"tries", display, raw }) exactly
 * once, and shows a friends-comparison list (FRIEND_PLAYS.kodword) ranked by
 * tries (ascending). All copy is Serbian (Latin); the data layer is mono +
 * tabular; only design tokens are used.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { makeRng } from "@/lib/avatars/core";
import { FRIEND_PLAYS, STREAKS } from "@/lib/gamehub/mock";
import type { GameModalProps, GameResult } from "@/lib/gamehub/types";
import { todayKey } from "@/lib/gamehub/types";
import { useT } from "@/components/i18n/LanguageProvider";

/* UI chrome strings (the word list stays Serbian/dev-term). */
const M = {
  close: { en: "Close", sr: "Zatvori" },
  dialogAria: { en: "Kodword — daily dev term", sr: "Kodword — dnevni dev pojam" },
  gameName: { en: "Kodword", sr: "Kodword" },
  subtitle: {
    en: "Guess the daily 5-letter dev term",
    sr: "Pogodi dnevni 5-slovni dev pojam",
  },
  yourStreak: { en: "Your streak", sr: "Tvoj niz" },
  tooFewLetters: { en: "Too few letters", sr: "Premalo slova" },
  unknownWord: { en: "Unknown word", sr: "Nepoznata reč" },
  boardAria: {
    en: "Guess board, {rows} attempts of {cols} letters",
    sr: "Tabla za pogađanje, {rows} pokušaja po {cols} slova",
  },
  keyboardAria: { en: "Keyboard", sr: "Tastatura" },
  empty: { en: "empty", sr: "prazno" },
  delete: { en: "Delete", sr: "Obriši" },
  enter: { en: "Confirm", sr: "Potvrdi" },
  letter: { en: "Letter", sr: "Slovo" },
  resultWin: { en: "Well done!", sr: "Bravo!" },
  resultLose: { en: "Next time!", sr: "Sledeći put!" },
  guessedIn: { en: "You guessed it in", sr: "Pogodio si za" },
  wordWas: { en: "Today's term was", sr: "Dnevni pojam je bio" },
  wordAria: { en: "Word", sr: "Reč" },
  friendsToday: { en: "Friends today", sr: "Prijatelji danas" },
  backToHub: { en: "Back to GameHub", sr: "Nazad na GameHub" },
  // screen-reader letter states
  stateEmpty: { en: "empty", sr: "prazno" },
  stateAbsent: { en: "not in word", sr: "nije u reči" },
  statePresent: {
    en: "in word, wrong spot",
    sr: "u reči, pogrešno mesto",
  },
  stateCorrect: { en: "correct", sr: "tačno" },
} as const;

/** Map a LetterState to its screen-reader message key. */
const STATE_MSG: Record<LetterState, keyof typeof M> = {
  empty: "stateEmpty",
  absent: "stateAbsent",
  present: "statePresent",
  correct: "stateCorrect",
};

/* Daily word pool
   Curated 5-letter programming / dev terms. The day's answer is rng.pick()-ed
   from this list; every entry doubles as an accepted guess so the validator
   never rejects a real word from the pool. */
const WORDS = [
  "ARRAY",
  "MERGE",
  "ASYNC",
  "CACHE",
  "STACK",
  "QUEUE",
  "BYTES",
  "REGEX",
  "LINUX",
  "REACT",
  "FETCH",
  "PROXY",
  "REDUX",
  "MYSQL",
  "REDIS",
  "SCALA",
  "SWIFT",
  "NGINX",
  "MACRO",
  "ENUMS",
  "FLOAT",
  "TUPLE",
  "LAMBA",
  "TOKEN",
  "MUTEX",
  "SHARD",
  "VITES",
  "DEBUG",
  "PATCH",
  "FLAGS",
  "INDEX",
  "MOUNT",
] as const;

const WORD_SET = new Set<string>(WORDS);

const ROWS = 6;
const COLS = 5;

type LetterState = "empty" | "absent" | "present" | "correct";
type Phase = "playing" | "won" | "lost";

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Y", "X", "C", "V", "B", "N", "M", "DEL"],
] as const;

/** Score a guess against the answer (Wordle two-pass: greens first, then yellows). */
function scoreGuess(guess: string, answer: string): LetterState[] {
  const res: LetterState[] = Array(COLS).fill("absent");
  const counts: Record<string, number> = {};
  for (const ch of answer) counts[ch] = (counts[ch] ?? 0) + 1;
  // Pass 1 — exact matches consume their letter from counts so pass 2 can't double-mark them yellow.
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answer[i]) {
      res[i] = "correct";
      counts[guess[i]]! -= 1;
    }
  }
  // Pass 2 — present-but-misplaced, honoring remaining letter counts to avoid over-marking duplicates.
  for (let i = 0; i < COLS; i++) {
    if (res[i] === "correct") continue;
    const ch = guess[i];
    if ((counts[ch] ?? 0) > 0) {
      res[i] = "present";
      counts[ch]! -= 1;
    }
  }
  return res;
}

// Keys can be guessed in multiple rows; STATE_RANK ensures the keyboard only upgrades (never downgrades) a key's colour.
const STATE_RANK: Record<LetterState, number> = {
  empty: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

export function KodwordGame({ open, onClose, onComplete }: GameModalProps) {
  const t = useT(M);
  // Daily answer — derived ONLY from the date seed (never Math.random/clock).
  const answer = useMemo(() => {
    const rng = makeRng("kodword-" + todayKey());
    return rng.pick(WORDS);
  }, []);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [phase, setPhase] = useState<Phase>("playing");
  const [shake, setShake] = useState(false);
  const [revealRow, setRevealRow] = useState(-1); // last submitted row index (drives flip)
  const [showResult, setShowResult] = useState(false);
  const [toast, setToast] = useState("");

  const completedRef = useRef(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streak = STREAKS.kodword;

  // Reset every open so re-entry starts the day's puzzle cleanly.
  useEffect(() => {
    if (!open) return;
    setGuesses([]);
    setCurrent("");
    setPhase("playing");
    setShake(false);
    setRevealRow(-1);
    setShowResult(false);
    setToast("");
    completedRef.current = false;
    return () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, [open]);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1400);
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShake(false), 460);
  }, []);

  const finish = useCallback(
    (solved: boolean, used: number) => {
      if (completedRef.current) return;
      completedRef.current = true;
      const display = (solved ? String(used) : "X") + "/6";
      const result: GameResult = {
        kind: "tries",
        display,
        raw: solved ? used : 7,
      };
      onComplete?.(result);
      // Wait for the flip CSS animation (staggered: 5 tiles × 0.28s delay + ~0.5s duration ≈ 1.9s max) to finish before revealing.
      if (resultTimer.current) clearTimeout(resultTimer.current);
      resultTimer.current = setTimeout(() => setShowResult(true), 1700);
    },
    [onComplete],
  );

  const submit = useCallback(() => {
    if (phase !== "playing") return;
    if (current.length < COLS) {
      triggerShake();
      flashToast(t("tooFewLetters"));
      return;
    }
    if (!WORD_SET.has(current)) {
      triggerShake();
      flashToast(t("unknownWord"));
      return;
    }
    const nextGuesses = [...guesses, current];
    const rowIdx = nextGuesses.length - 1;
    setGuesses(nextGuesses);
    setCurrent("");
    setRevealRow(rowIdx);

    if (current === answer) {
      setPhase("won");
      finish(true, nextGuesses.length);
    } else if (nextGuesses.length >= ROWS) {
      setPhase("lost");
      finish(false, nextGuesses.length);
    }
  }, [phase, current, guesses, answer, triggerShake, flashToast, finish, t]);

  const onKey = useCallback(
    (raw: string) => {
      if (phase !== "playing") return;
      const key = raw.toUpperCase();
      if (key === "ENTER") {
        submit();
      } else if (key === "DEL" || key === "BACKSPACE") {
        setCurrent((c) => c.slice(0, -1));
      } else if (/^[A-Z]$/.test(key)) {
        setCurrent((c) => (c.length < COLS ? c + key : c));
      }
    },
    [phase, submit],
  );

  // Physical keyboard while open: ESC closes, letters/enter/backspace play.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (showResult) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onKey("ENTER");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onKey("BACKSPACE");
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        onKey(e.key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, showResult, onClose, onKey]);

  // Per-key discovered states for the on-screen keyboard.
  const keyStates = useMemo(() => {
    const map: Record<string, LetterState> = {};
    for (const g of guesses) {
      const sc = scoreGuess(g, answer);
      for (let i = 0; i < COLS; i++) {
        const ch = g[i];
        const prev = map[ch] ?? "empty";
        if (STATE_RANK[sc[i]] > STATE_RANK[prev]) map[ch] = sc[i];
      }
    }
    return map;
  }, [guesses, answer]);

  // Friends, ranked by tries ascending (fewer is better).
  const rankedFriends = useMemo(() => {
    return [...FRIEND_PLAYS.kodword].sort((a, b) => (a.result.raw ?? 99) - (b.result.raw ?? 99));
  }, []);

  if (!open) return null;

  const solved = phase === "won";
  const triesUsed = guesses.length;

  // Build the 6 rows: submitted guesses, the active row, then empties.
  const rows: { letters: string; submitted: boolean; rowIndex: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (r < guesses.length) {
      rows.push({ letters: guesses[r], submitted: true, rowIndex: r });
    } else if (r === guesses.length && phase === "playing") {
      rows.push({ letters: current, submitted: false, rowIndex: r });
    } else {
      rows.push({ letters: "", submitted: false, rowIndex: r });
    }
  }

  return (
    <div
      className="gm-overlay open"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{KODWORD_CSS}</style>
      <div
        className="gm-dialog kw-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogAria")}
      >
        <button type="button" className="gm-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="x" />
        </button>

        <header className="kw-head">
          <span className="kw-badge" aria-hidden="true">
            <Icon name="zap" />
          </span>
          <div className="kw-head-titles">
            <h2 className="kw-title">{t("gameName")}</h2>
            <p className="kw-sub">{t("subtitle")}</p>
          </div>
          <span className="kw-streak u-mono" title={t("yourStreak")}>
            <Icon name="flame" />
            <span className="tnum">{streak.current}</span>
          </span>
        </header>

        {!showResult ? (
          <div className="kw-play">
            {/* Live region for invalid-guess / status toasts. */}
            <div className="kw-toast-wrap" aria-live="polite" aria-atomic="true">
              {toast && <span className="kw-toast">{toast}</span>}
            </div>

            <div
              className="kw-board"
              role="grid"
              aria-label={t("boardAria")
                .replace("{rows}", String(ROWS))
                .replace("{cols}", String(COLS))}
            >
              {rows.map((row, r) => {
                const isActive = !row.submitted && r === guesses.length && phase === "playing";
                const score = row.submitted ? scoreGuess(row.letters, answer) : null;
                return (
                  <div
                    key={r}
                    role="row"
                    className={
                      "kw-row" +
                      (isActive && shake ? " kw-shake" : "") +
                      (row.submitted && r === revealRow ? " kw-reveal" : "")
                    }
                  >
                    {Array.from({ length: COLS }).map((_, c) => {
                      const ch = row.letters[c] ?? "";
                      const st: LetterState = score ? score[c] : "empty";
                      const filled = ch !== "";
                      return (
                        <div
                          key={c}
                          role="gridcell"
                          className={
                            "kw-tile" +
                            (row.submitted ? " is-submitted kw-" + st : "") +
                            (!row.submitted && filled ? " is-filled" : "") +
                            (isActive && filled ? " kw-pop" : "")
                          }
                          style={
                            row.submitted
                              ? ({ ["--d" as string]: `${c * 0.28}s` } as React.CSSProperties)
                              : undefined
                          }
                          aria-label={
                            row.submitted
                              ? `${ch || t("empty")}: ${t(STATE_MSG[st])}`
                              : ch || t("empty")
                          }
                        >
                          <span className="kw-tile-face">{ch}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="kw-kb" role="group" aria-label={t("keyboardAria")}>
              {KEY_ROWS.map((kr, i) => (
                <div className="kw-kb-row" key={i}>
                  {kr.map((k) => {
                    const wide = k === "ENTER" || k === "DEL";
                    const st = keyStates[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        className={
                          "kw-key" + (wide ? " kw-key-wide" : "") + (st ? " kw-" + st : "")
                        }
                        onClick={() => onKey(k)}
                        disabled={phase !== "playing"}
                        aria-label={
                          k === "DEL"
                            ? t("delete")
                            : k === "ENTER"
                              ? t("enter")
                              : `${t("letter")} ${k}${st ? ", " + t(STATE_MSG[st]) : ""}`
                        }
                      >
                        {k === "DEL" ? (
                          <Icon name="x" />
                        ) : k === "ENTER" ? (
                          <Icon name="check" />
                        ) : (
                          k
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ResultScreen
            solved={solved}
            triesUsed={triesUsed}
            answer={answer}
            rankedFriends={rankedFriends}
            onClose={onClose}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

/* Result screen */
function ResultScreen({
  solved,
  triesUsed,
  answer,
  rankedFriends,
  onClose,
  t,
}: {
  solved: boolean;
  triesUsed: number;
  answer: string;
  rankedFriends: typeof FRIEND_PLAYS.kodword;
  onClose: () => void;
  t: (k: keyof typeof M) => string;
}) {
  return (
    <div className="kw-result">
      <span className={"kw-result-icon" + (solved ? " is-win" : " is-loss")} aria-hidden="true">
        <Icon name={solved ? "trophy" : "shield"} />
      </span>
      <h3 className="kw-result-title">{solved ? t("resultWin") : t("resultLose")}</h3>
      <p className="kw-result-sub">
        {solved ? (
          <>
            {t("guessedIn")} <span className="u-mono tnum kw-strong">{triesUsed}</span>/6
          </>
        ) : (
          <>{t("wordWas")}</>
        )}
      </p>
      <div className="kw-answer" aria-label={`${t("wordAria")}: ${answer}`}>
        {answer.split("").map((ch, i) => (
          <span key={i} className="kw-answer-tile">
            {ch}
          </span>
        ))}
      </div>

      <div className="kw-friends">
        <div className="kw-friends-head">
          <Icon name="trophy" className="kw-friends-ic" />
          <span>{t("friendsToday")}</span>
        </div>
        <ul className="kw-friends-list">
          {rankedFriends.map((f, i) => (
            <li className="kw-friend" key={f.handle}>
              <span className="kw-friend-rank u-mono tnum">{i + 1}</span>
              <span className="kw-friend-av">
                <GenerativeAvatar seed={f.handle} variant="orbit" size={34} />
              </span>
              <span className="kw-friend-info">
                <span className="kw-friend-name">{f.name}</span>
                <span className="kw-friend-when">{f.playedAt}</span>
              </span>
              <span className="kw-friend-res u-mono tnum">{f.result.raw}/6</span>
            </li>
          ))}
        </ul>
      </div>

      <button type="button" className="btn btn-primary kw-result-btn" onClick={onClose}>
        {t("backToHub")}
      </button>
    </div>
  );
}

/* Scoped styles (kw-*) — tokens only; no shared CSS touched */
const KODWORD_CSS = `
.kw-dialog{ width:480px; max-width:100%; padding:0; }

.kw-head{ display:flex; align-items:center; gap:13px; padding:20px 22px 14px; }
.kw-badge{
  width:42px; height:42px; border-radius:12px; flex-shrink:0; display:grid; place-items:center;
  color:var(--lemon-vivid); background:rgba(236,226,58,.1); border:1px solid rgba(236,226,58,.3);
}
.kw-badge .ic{ width:21px; height:21px; }
.kw-head-titles{ flex:1; min-width:0; }
.kw-title{ font-family:var(--display); font-weight:800; font-size:22px; letter-spacing:-.025em; color:var(--ink); line-height:1.05; }
.kw-sub{ font-size:12.5px; color:var(--muted); margin-top:2px; }
.kw-streak{
  flex-shrink:0; display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:var(--r-pill);
  background:rgba(236,226,58,.1); border:1px solid rgba(236,226,58,.3); color:var(--lemon-vivid);
  font-family:var(--mono); font-weight:700; font-size:13px; letter-spacing:-.02em; font-variant-numeric:tabular-nums;
}
.kw-streak .ic{ width:13px; height:13px; }

.kw-play{ padding:4px 22px 22px; }

.kw-toast-wrap{ height:30px; display:grid; place-items:center; }
.kw-toast{
  font-size:12.5px; font-weight:700; color:var(--ink); letter-spacing:-.01em;
  background:var(--surface-3); border:1px solid var(--line); padding:5px 12px; border-radius:var(--r-pill);
  box-shadow:0 8px 20px -10px rgba(0,0,0,.7); animation:kw-toast-in .18s var(--ease-out);
}
@keyframes kw-toast-in{ from{ opacity:0; transform:translateY(-5px); } to{ opacity:1; transform:none; } }

.kw-board{ display:grid; grid-template-rows:repeat(6, 1fr); gap:7px; max-width:316px; margin:2px auto 18px; }
.kw-row{ display:grid; grid-template-columns:repeat(5, 1fr); gap:7px; }
.kw-tile{
  position:relative; aspect-ratio:1; border-radius:var(--r-sm);
  display:grid; place-items:center; background:var(--surface);
  border:1.5px solid var(--line); transition:border-color var(--dur-1) var(--ease-out);
  perspective:600px;
}
.kw-tile-face{
  font-family:var(--mono); font-weight:800; font-size:26px; line-height:1; color:var(--ink);
  letter-spacing:-.02em; text-transform:uppercase; backface-visibility:hidden;
}
.kw-tile.is-filled{ border-color:var(--violet-light); }
.kw-tile.kw-pop{ animation:kw-pop .12s var(--ease-out); }
@keyframes kw-pop{ 0%{ transform:scale(.9); } 60%{ transform:scale(1.07); } 100%{ transform:scale(1); } }

/* Submitted tiles flip to reveal their scored color. */
.kw-tile.is-submitted{ animation:kw-flip .5s var(--ease-out) both; animation-delay:var(--d,0s); }
@keyframes kw-flip{
  0%{ transform:rotateX(0); }
  50%{ transform:rotateX(-90deg); }
  100%{ transform:rotateX(0); }
}
/* Only animate the flip on the freshly-revealed row; older rows stay settled. */
.kw-row:not(.kw-reveal) .kw-tile.is-submitted{ animation:none; }

.kw-tile.kw-correct{ background:var(--green); border-color:var(--green); }
.kw-tile.kw-correct .kw-tile-face{ color:#06291C; }
.kw-tile.kw-present{ background:var(--lemon); border-color:var(--lemon); }
.kw-tile.kw-present .kw-tile-face{ color:#231F00; }
.kw-tile.kw-absent{ background:var(--surface-3); border-color:var(--line); }
.kw-tile.kw-absent .kw-tile-face{ color:var(--muted); }

.kw-shake{ animation:kw-shake .42s var(--ease-out); }
@keyframes kw-shake{
  10%,90%{ transform:translateX(-1px); }
  20%,80%{ transform:translateX(2px); }
  30%,50%,70%{ transform:translateX(-4px); }
  40%,60%{ transform:translateX(4px); }
}

/* Keyboard */
.kw-kb{ display:flex; flex-direction:column; gap:7px; }
.kw-kb-row{ display:flex; justify-content:center; gap:6px; }
.kw-key{
  flex:1; min-width:0; height:48px; border-radius:var(--r-sm);
  display:grid; place-items:center; cursor:pointer;
  font-family:var(--mono); font-weight:700; font-size:15px; letter-spacing:-.01em; text-transform:uppercase;
  color:var(--ink); background:var(--surface-3); border:1px solid var(--line);
  transition:background var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out), transform var(--dur-1) var(--ease-out);
}
.kw-key .ic{ width:17px; height:17px; }
.kw-key:hover:not(:disabled){ background:var(--surface-2); border-color:var(--violet-light); }
.kw-key:active:not(:disabled){ transform:translateY(1px); }
.kw-key:disabled{ cursor:default; opacity:.85; }
.kw-key-wide{ flex:1.6; }
.kw-key.kw-correct{ background:var(--green); border-color:var(--green); color:#06291C; }
.kw-key.kw-present{ background:var(--lemon); border-color:var(--lemon); color:#231F00; }
.kw-key.kw-absent{ background:var(--bg); border-color:var(--line-soft); color:var(--muted); }

/* Result screen */
.kw-result{ padding:24px 22px 22px; display:flex; flex-direction:column; align-items:center; text-align:center; animation:kw-result-in .3s var(--ease-quint) both; }
@keyframes kw-result-in{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:none; } }
.kw-result-icon{ width:54px; height:54px; border-radius:15px; display:grid; place-items:center; margin-bottom:4px; }
.kw-result-icon .ic{ width:27px; height:27px; }
.kw-result-icon.is-win{ color:var(--lemon-vivid); background:rgba(236,226,58,.12); border:1px solid rgba(236,226,58,.32); box-shadow:var(--glow-lemon); }
.kw-result-icon.is-loss{ color:var(--violet-light); background:rgba(180,155,255,.12); border:1px solid rgba(180,155,255,.32); }
.kw-result-title{ font-family:var(--display); font-weight:800; font-size:24px; letter-spacing:-.025em; color:var(--ink); margin-top:8px; }
.kw-result-sub{ font-size:13.5px; color:var(--muted); margin-top:4px; }
.kw-strong{ color:var(--ink); font-weight:700; }

.kw-answer{ display:flex; gap:7px; margin:14px 0 6px; }
.kw-answer-tile{
  width:40px; height:40px; border-radius:var(--r-sm); display:grid; place-items:center;
  font-family:var(--mono); font-weight:800; font-size:21px; text-transform:uppercase; letter-spacing:-.02em;
  color:#06291C; background:var(--green); border:1px solid var(--green);
}

.kw-friends{ width:100%; margin-top:18px; border-top:1px solid var(--line-soft); padding-top:14px; }
.kw-friends-head{ display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; padding:0 2px; }
.kw-friends-ic{ width:14px; height:14px; color:var(--lemon-vivid); }
.kw-friends-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
.kw-friend{ display:flex; align-items:center; gap:11px; padding:9px 4px; text-align:left; }
.kw-friend + .kw-friend{ border-top:1px solid var(--line-soft); }
.kw-friend-rank{ width:18px; flex-shrink:0; text-align:center; font-size:13px; font-weight:800; color:var(--muted); font-variant-numeric:tabular-nums; }
.kw-friend-av{ width:34px; height:34px; border-radius:50%; overflow:hidden; flex-shrink:0; border:1px solid var(--line); }
.kw-friend-av :is(svg){ display:block; width:100%; height:100%; }
.kw-friend-info{ flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.kw-friend-name{ font-size:14px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kw-friend-when{ font-size:11.5px; color:var(--muted); }
.kw-friend-res{ flex-shrink:0; font-size:14px; font-weight:700; color:var(--green); font-variant-numeric:tabular-nums; letter-spacing:-.02em; }

.kw-result-btn{ margin-top:18px; width:100%; }

@media (max-width:520px){
  .kw-key{ height:46px; font-size:14px; }
  .kw-tile-face{ font-size:23px; }
}
`;

export default KodwordGame;
