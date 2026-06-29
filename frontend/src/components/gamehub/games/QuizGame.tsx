"use client";

/**
 * QuizGame — "Dev Kviz" daily 5-question trivia modal.
 *
 * Implements GameModalProps from "@/lib/gamehub/types".
 * Questions are picked deterministically from a larger pool using
 * makeRng("quiz-" + todayKey()) so everyone sees the same 5 questions today.
 */

import { useEffect, useCallback, useState } from "react";
import { makeRng } from "@/lib/avatars/core";
import { todayKey } from "@/lib/gamehub/types";
import type { GameModalProps, GameResult } from "@/lib/gamehub/types";
import { FRIEND_PLAYS, STREAKS } from "@/lib/gamehub/mock";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/* UI chrome strings (quiz questions + options stay Serbian). */
const M = {
  gameName: { en: "Dev Quiz", sr: "Dev Kviz" },
  subtitle: {
    en: "Five questions from dev folklore",
    sr: "Pet pitanja iz dev folklora",
  },
  close: { en: "Close", sr: "Zatvori" },
  finished: { en: "Finished", sr: "Završeno" },
  question: { en: "Question", sr: "Pitanje" },
  correctCount: { en: "correct", sr: "tačnih" },
  correct: { en: "Correct!", sr: "Tačno!" },
  wrongPrefix: { en: "Wrong. Correct answer:", sr: "Netačno. Tačan odgovor:" },
  finish: { en: "Finish", sr: "Završi" },
  next: { en: "Next", sr: "Sledeće" },
  friendsToday: { en: "Friends today", sr: "Prijatelji danas" },
  you: { en: "You", sr: "Ti" },
  justNow: { en: "just now", sr: "upravo" },
  // rank labels
  rankPerfect: { en: "Perfect!", sr: "Savršeno!" },
  rankSolid: { en: "Solid!", sr: "Solidno!" },
  rankTryTomorrow: { en: "Try tomorrow!", sr: "Probaj sutra!" },
  rankBetterLuck: {
    en: "Better luck next time!",
    sr: "Bolje sreće sledeći put!",
  },
} as const;

/* Question pool */

interface Question {
  clue: string;
  options: string[];
  answer: number; // index into options
}

const QUESTION_POOL: Question[] = [
  {
    clue: "Koji princip kaže da softverski entiteti treba da budu otvoreni za proširenje, a zatvoreni za modifikaciju?",
    options: ["Single Responsibility", "Open/Closed", "Liskov Substitution", "Interface Segregation"],
    answer: 1,
  },
  {
    clue: "Šta znači akronim REST u web razvoju?",
    options: [
      "Rapid Execution of Software Tasks",
      "Representational State Transfer",
      "Remote Endpoint Service Technology",
      "Recursive Entity State Transformer",
    ],
    answer: 1,
  },
  {
    clue: "Koja struktura podataka koristi princip LIFO (Last In, First Out)?",
    options: ["Red (Queue)", "Stek (Stack)", "Gomila (Heap)", "Trie"],
    answer: 1,
  },
  {
    clue: "Šta je 'Big O notacija'?",
    options: [
      "Naziv za najveću O u HTML atributima",
      "Metod za opis vremenske ili prostorne složenosti algoritma",
      "Protokol za autentifikaciju",
      "Format za serijalizaciju podataka",
    ],
    answer: 1,
  },
  {
    clue: "Koji Git komand pravi novu granu i odmah prebacuje na nju?",
    options: ["git branch nova", "git merge nova", "git checkout -b nova", "git push --branch nova"],
    answer: 2,
  },
  {
    clue: "Šta vraća Array.prototype.map() u JavaScript-u?",
    options: [
      "Isti originalni niz (mutiran)",
      "Novi niz sa rezultatima primene callback funkcije na svaki element",
      "Boolean vrednost",
      "Broj elemenata niza",
    ],
    answer: 1,
  },
  {
    clue: "Koji HTTP status kod označava 'Not Found'?",
    options: ["200", "301", "403", "404"],
    answer: 3,
  },
  {
    clue: "Šta je 'debounce' u frontend razvoju?",
    options: [
      "Tehnika za otklanjanje CSS konflikata",
      "Ograničavanje učestalosti pozivanja funkcije — poziva se tek nakon što prođe određeno vreme od poslednjeg okidača",
      "Metod za dubliranje event listener-a",
      "Naziv za animaciju skakanja u CSS-u",
    ],
    answer: 1,
  },
  {
    clue: "Koja od sledećih baza podataka je relaciona (SQL)?",
    options: ["MongoDB", "Redis", "PostgreSQL", "DynamoDB"],
    answer: 2,
  },
  {
    clue: "Šta radi 'git rebase'?",
    options: [
      "Briše sve commit-ove na branchi",
      "Premešta ili 'ponavlja' commit-ove jedne grane na vrh druge",
      "Merge-uje dve grane uz novi merge commit",
      "Klonira udaljeni repozitorijum",
    ],
    answer: 1,
  },
  {
    clue: "U React-u, šta se dešava kada pozovete useState setter funkciju?",
    options: [
      "Komponenta se unmount-uje i mount-uje iznova",
      "Komponentina stanje se menja i komponenta se ponovo renderuje",
      "Menja se samo DOM, React state ostaje isti",
      "Poziva se useEffect sinhrono",
    ],
    answer: 1,
  },
  {
    clue: "Koji dizajn patern koristi fabriku za kreiranje objekata bez specificiranja konkretne klase?",
    options: ["Singleton", "Observer", "Factory Method", "Decorator"],
    answer: 2,
  },
  {
    clue: "Šta je 'CI/CD' u softverskom inženjerstvu?",
    options: [
      "Client Interface / Component Design",
      "Continuous Integration / Continuous Deployment (ili Delivery)",
      "Code Inspection / Code Distribution",
      "Container Image / Container Deploy",
    ],
    answer: 1,
  },
  {
    clue: "Koja od sledećih struktura podataka ima O(1) pristup po indeksu?",
    options: ["Ulančana lista (Linked List)", "Binarno stablo pretrage", "Niz (Array)", "Graf"],
    answer: 2,
  },
  {
    clue: "Šta znači 'idempotentna' HTTP metoda?",
    options: [
      "Metoda koja uvek vraća isti odgovor",
      "Metoda čiji se efekat ne menja bez obzira koliko puta se pozove sa istim parametrima",
      "Metoda koja ne menja server stanje",
      "Metoda koja zahteva autentifikaciju",
    ],
    answer: 1,
  },
  {
    clue: "U TypeScript-u, šta radi 'as const' assertion?",
    options: [
      "Pretvara vrednost u konstantu koja se ne može menjati u runtime-u",
      "Označava da je vrednost readonly u type sistemu, sprečavajući proširivanje tipova",
      "Importuje konstantu iz drugog modula",
      "Definiše konstantni enum",
    ],
    answer: 1,
  },
  {
    clue: "Koji protokol koristi WebSocket za inicijalni handshake?",
    options: ["TCP direktno", "HTTP Upgrade mehanizam", "UDP", "SMTP"],
    answer: 1,
  },
  {
    clue: "Šta je 'memoizacija' u programiranju?",
    options: [
      "Tehnika upravljanja memorijom u C-u",
      "Optimizacija gde se kešuju rezultati skupih funkcija na osnovu njihovih ulaza",
      "Kompajlerska optimizacija za inline funkcije",
      "Metod za garbage collection",
    ],
    answer: 1,
  },
  {
    clue: "Šta znači 'Šta je gore biti nego digitron?' u kohor leksikonu?",
    options: ["Digitalac", "Kalkulator", "Digi", "Pešić"],
    answer: 1,
  },
  {
    clue: "Koji od sledećih algoritama sortiranja ima najgoru vremensku složenost O(n²)?",
    options: ["Merge Sort", "Heap Sort", "Bubble Sort", "Quick Sort (prosek)"],
    answer: 2,
  },
];

/* Helpers */

const QUESTIONS_PER_GAME = 5;

function getDailyQuestions(): Question[] {
  const rng = makeRng("quiz-" + todayKey());
  const pool = [...QUESTION_POOL];
  const picked: Question[] = [];
  for (let i = 0; i < QUESTIONS_PER_GAME && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

function rankLabel(score: number): { icon: string; titleKey: keyof typeof M } {
  if (score === 5) return { icon: "trophy", titleKey: "rankPerfect" };
  if (score >= 3) return { icon: "star", titleKey: "rankSolid" };
  if (score >= 1) return { icon: "flame", titleKey: "rankTryTomorrow" };
  return { icon: "zap", titleKey: "rankBetterLuck" };
}

/* Types */

type GamePhase = "playing" | "result";

interface AnswerState {
  selected: number | null;
  revealed: boolean;
}

/* Component */

export function QuizGame({ open, onClose, onComplete }: GameModalProps) {
  const t = useT(M);
  const [questions] = useState<Question[]>(() => getDailyQuestions());
  const [phase, setPhase] = useState<GamePhase>("playing");
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState<AnswerState>({ selected: null, revealed: false });
  const [finalResult, setFinalResult] = useState<GameResult | null>(null);

  // Reset state whenever modal opens
  useEffect(() => {
    if (open) {
      setPhase("playing");
      setQIndex(0);
      setScore(0);
      setAnswer({ selected: null, revealed: false });
      setFinalResult(null);
    }
  }, [open]);

  // Escape to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const currentQ = questions[qIndex];
  const isLastQuestion = qIndex === questions.length - 1;

  function selectAnswer(idx: number) {
    if (answer.revealed) return;
    const correct = idx === currentQ.answer;
    const newScore = correct ? score + 1 : score;
    if (correct) setScore(newScore);
    setAnswer({ selected: idx, revealed: true });
    // On last question, pre-compute result to pass to onComplete later
    if (isLastQuestion) {
      setFinalResult({
        kind: "score",
        display: `${newScore}/5`,
        raw: newScore,
      });
    }
  }

  function advance() {
    if (isLastQuestion) {
      const result: GameResult = finalResult ?? { kind: "score", display: `${score}/5`, raw: score };
      onComplete?.(result);
      setPhase("result");
    } else {
      setQIndex((i) => i + 1);
      setAnswer({ selected: null, revealed: false });
    }
  }

  // Friends comparison — sort by raw desc (higher score = better)
  const friendPlays = [...FRIEND_PLAYS["quiz"]].sort(
    (a, b) => (b.result.raw ?? 0) - (a.result.raw ?? 0),
  );
  const streak = STREAKS["quiz"];

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const displayScore = phase === "result" ? (finalResult?.raw ?? score) : score;

  return (
    <div className="gm-overlay" onClick={handleOverlayClick} style={{ alignItems: "center" }}>
      <div className="gm-dialog qz-dialog" role="dialog" aria-modal="true" aria-label={t("gameName")}>

        {/* Accent bar is rendered via ::before in gamehub.css */}

        {/* Close button */}
        <button className="gm-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="x" />
        </button>

        {/* Header */}
        <div className="qz-header">
          <div className="qz-header-left">
            <div className="qz-icon-tile gc-violet">
              <Icon name="hackathon" />
            </div>
            <div>
              <div className="qz-title">{t("gameName")}</div>
              <div className="qz-subtitle">{t("subtitle")}</div>
            </div>
          </div>
          <div className="qz-streak-chip">
            <Icon name="flame" />
            <span className="u-mono tnum">{streak.current}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="qz-progress-wrap">
          <div className="qz-progress-top">
            <span className="qz-progress-label">
              {phase === "result"
                ? t("finished")
                : `${t("question")} ${qIndex + 1}/${questions.length}`}
            </span>
            <span className="qz-score-chip u-mono tnum">
              <Icon name="star" className="qz-score-ic" />
              {displayScore} {t("correctCount")}
            </span>
          </div>
          <div className="qz-bar">
            <div
              className="qz-bar-fill"
              style={{
                width: `${
                  phase === "result"
                    ? 100
                    : (qIndex / questions.length) * 100
                }%`,
              }}
            />
          </div>
        </div>

        {/* Playing phase */}
        {phase === "playing" && (
          <div className="qz-body">
            <div className="qz-clue">{currentQ.clue}</div>

            <div className="qz-options">
              {currentQ.options.map((opt, i) => {
                let cls = "qz-opt";
                if (answer.revealed) {
                  if (i === currentQ.answer) cls += " qz-opt--correct";
                  else if (i === answer.selected) cls += " qz-opt--wrong";
                  else cls += " qz-opt--dim";
                }
                return (
                  <button
                    key={i}
                    className={cls}
                    onClick={() => selectAnswer(i)}
                    disabled={answer.revealed}
                  >
                    <span className="qz-opt-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="qz-opt-text">{opt}</span>
                    {answer.revealed && i === currentQ.answer && (
                      <span className="qz-opt-badge qz-opt-badge--correct">
                        <Icon name="check" />
                      </span>
                    )}
                    {answer.revealed && i === answer.selected && i !== currentQ.answer && (
                      <span className="qz-opt-badge qz-opt-badge--wrong">
                        <Icon name="x" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {answer.revealed && (
              <div
                className={`qz-feedback ${
                  answer.selected === currentQ.answer ? "qz-feedback--correct" : "qz-feedback--wrong"
                }`}
              >
                {answer.selected === currentQ.answer ? (
                  <>
                    <Icon name="check" />
                    <span>{t("correct")}</span>
                  </>
                ) : (
                  <>
                    <Icon name="x" />
                    <span>
                      {t("wrongPrefix")}{" "}
                      <strong>{currentQ.options[currentQ.answer]}</strong>
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="qz-actions">
              {answer.revealed && (
                <button className="btn btn-violet qz-next-btn" onClick={advance}>
                  {isLastQuestion ? t("finish") : t("next")}
                  <Icon name={isLastQuestion ? "trophy" : "chevron-down"} className="qz-next-ic" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Result phase */}
        {phase === "result" && (
          <div className="qz-result-body">
            {/* Score hero */}
            <div className="qz-final-hero">
              <div className="qz-final-icon-wrap">
                <Icon name={rankLabel(displayScore).icon} />
              </div>
              <div className="qz-final-title">{t(rankLabel(displayScore).titleKey)}</div>
              <div className="qz-final-score u-mono tnum">
                {displayScore}/{questions.length}
                <span className="qz-final-score-pct">
                  &nbsp;·&nbsp;{Math.round((displayScore / questions.length) * 100)}%
                </span>
              </div>
            </div>

            {/* Friends comparison */}
            <div className="qz-friends-section">
              <div className="qz-friends-label">{t("friendsToday")}</div>
              <div className="qz-friends-list">
                {friendPlays.map((fp, idx) => {
                  const isTop = idx === 0;
                  return (
                    <div key={fp.handle} className={`qz-friend-row${isTop ? " qz-friend-row--top" : ""}`}>
                      <span className="qz-friend-rank u-mono tnum">{idx + 1}</span>
                      <div
                        className="qz-friend-av"
                        style={{ borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}
                      >
                        <GenerativeAvatar seed={fp.handle} variant="orbit" size={34} />
                      </div>
                      <div className="qz-friend-info">
                        <div className="qz-friend-name">{fp.name}</div>
                        <div className="qz-friend-time">{fp.playedAt}</div>
                      </div>
                      <div className="qz-friend-result u-mono tnum">{fp.result.display}</div>
                    </div>
                  );
                })}

                {/* Player's own row */}
                {(() => {
                  // Insert player at correct rank position for display purposes
                  const playerRank =
                    friendPlays.filter((fp) => (fp.result.raw ?? 0) > displayScore).length + 1;
                  return (
                    <div className="qz-friend-row qz-friend-row--you">
                      <span className="qz-friend-rank u-mono tnum">{playerRank}</span>
                      <div
                        className="qz-friend-av"
                        style={{ borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}
                      >
                        <GenerativeAvatar seed="you" variant="orbit" size={34} />
                      </div>
                      <div className="qz-friend-info">
                        <div className="qz-friend-name">{t("you")}</div>
                        <div className="qz-friend-time">{t("justNow")}</div>
                      </div>
                      <div className="qz-friend-result u-mono tnum">{displayScore}/5</div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="qz-result-actions">
              <button className="btn btn-secondary" onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        /* QuizGame scoped styles */
        .qz-dialog {
          width: 540px;
          max-width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--line) transparent;
        }

        /* Header */
        .qz-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 22px 24px 0;
        }
        .qz-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .qz-icon-tile {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          background: rgba(180, 155, 255, 0.12);
          border: 1px solid rgba(180, 155, 255, 0.3);
          color: var(--violet-light);
        }
        .qz-icon-tile .ic {
          width: 22px;
          height: 22px;
        }
        .qz-title {
          font-family: var(--display);
          font-weight: 800;
          font-size: 20px;
          letter-spacing: -0.025em;
          color: var(--ink);
          line-height: 1.1;
        }
        .qz-subtitle {
          font-size: 12px;
          color: var(--muted);
          margin-top: 2px;
        }
        .qz-streak-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: var(--r-pill);
          background: rgba(236, 226, 58, 0.1);
          border: 1px solid rgba(236, 226, 58, 0.3);
          color: var(--lemon-vivid);
          font-weight: 700;
          font-size: 13px;
          flex-shrink: 0;
          margin-right: 40px; /* clear the close button */
        }
        .qz-streak-chip .ic {
          width: 13px;
          height: 13px;
        }

        /* Progress */
        .qz-progress-wrap {
          padding: 16px 24px 0;
        }
        .qz-progress-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .qz-progress-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .qz-score-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12.5px;
          color: var(--violet-light);
          font-weight: 700;
        }
        .qz-score-ic {
          width: 12px;
          height: 12px;
        }
        .qz-bar {
          height: 5px;
          background: var(--surface-3);
          border-radius: 4px;
          overflow: hidden;
          border: 1px solid var(--line-soft);
        }
        .qz-bar-fill {
          height: 100%;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--violet), var(--violet-light));
          box-shadow: 0 0 10px -2px var(--violet-light);
          transition: width 0.4s var(--ease-out);
        }

        /* Question body */
        .qz-body {
          padding: 20px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .qz-clue {
          font-family: var(--display);
          font-weight: 700;
          font-size: 17px;
          letter-spacing: -0.02em;
          color: var(--ink);
          line-height: 1.4;
        }

        /* Options */
        .qz-options {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .qz-opt {
          display: flex;
          align-items: center;
          gap: 11px;
          width: 100%;
          padding: 11px 14px;
          border-radius: var(--r-md);
          background: var(--surface-2);
          border: 1px solid var(--line);
          color: var(--ink);
          text-align: left;
          cursor: pointer;
          transition:
            border-color 0.15s var(--ease-out),
            background 0.15s var(--ease-out),
            transform 0.1s var(--ease-out);
          font-size: 14px;
          font-family: var(--body);
          line-height: 1.4;
        }
        .qz-opt:hover:not(:disabled) {
          border-color: var(--violet-light);
          background: rgba(180, 155, 255, 0.08);
          transform: translateX(2px);
        }
        .qz-opt:disabled {
          cursor: default;
        }
        .qz-opt--correct {
          border-color: var(--green) !important;
          background: rgba(79, 216, 166, 0.1) !important;
          color: var(--ink) !important;
        }
        .qz-opt--wrong {
          border-color: var(--red) !important;
          background: rgba(255, 80, 80, 0.1) !important;
          color: var(--ink-2) !important;
        }
        .qz-opt--dim {
          opacity: 0.5;
        }
        .qz-opt-letter {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          border-radius: 7px;
          background: var(--surface-3);
          border: 1px solid var(--line);
          display: grid;
          place-items: center;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--muted);
          font-family: var(--mono);
          transition: background 0.15s, border-color 0.15s;
        }
        .qz-opt--correct .qz-opt-letter {
          background: rgba(79, 216, 166, 0.2);
          border-color: var(--green);
          color: var(--green);
        }
        .qz-opt--wrong .qz-opt-letter {
          background: rgba(255, 80, 80, 0.15);
          border-color: var(--red);
          color: var(--red);
        }
        .qz-opt-text {
          flex: 1;
          min-width: 0;
        }
        .qz-opt-badge {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: grid;
          place-items: center;
        }
        .qz-opt-badge--correct {
          background: rgba(79, 216, 166, 0.2);
          color: var(--green);
        }
        .qz-opt-badge--wrong {
          background: rgba(255, 80, 80, 0.15);
          color: var(--red);
        }
        .qz-opt-badge .ic {
          width: 11px;
          height: 11px;
        }

        /* Feedback */
        .qz-feedback {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: var(--r-md);
          font-size: 13.5px;
          font-weight: 600;
          animation: qz-pop 0.2s var(--ease-out);
        }
        @keyframes qz-pop {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        .qz-feedback .ic {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }
        .qz-feedback--correct {
          background: rgba(79, 216, 166, 0.1);
          border: 1px solid rgba(79, 216, 166, 0.3);
          color: var(--green);
        }
        .qz-feedback--wrong {
          background: rgba(255, 80, 80, 0.08);
          border: 1px solid rgba(255, 80, 80, 0.25);
          color: var(--red);
        }
        .qz-feedback--wrong strong {
          color: var(--ink-2);
        }

        /* Actions */
        .qz-actions {
          display: flex;
          justify-content: flex-end;
          min-height: 42px;
        }
        .qz-next-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .qz-next-ic {
          width: 14px;
          height: 14px;
          transform: rotate(-90deg);
        }

        /* Result body */
        .qz-result-body {
          padding: 20px 24px 26px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          animation: gm-rise 0.3s var(--ease-quint) both;
        }

        /* Final hero */
        .qz-final-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 24px 16px 20px;
          border-radius: var(--r-md);
          background: linear-gradient(135deg, rgba(180, 155, 255, 0.1), rgba(180, 155, 255, 0.04));
          border: 1px solid rgba(180, 155, 255, 0.25);
          text-align: center;
        }
        .qz-final-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: rgba(180, 155, 255, 0.14);
          border: 1px solid rgba(180, 155, 255, 0.35);
          color: var(--violet-light);
          margin-bottom: 4px;
        }
        .qz-final-icon-wrap .ic {
          width: 28px;
          height: 28px;
        }
        .qz-final-title {
          font-family: var(--display);
          font-weight: 800;
          font-size: 22px;
          letter-spacing: -0.025em;
          color: var(--ink);
        }
        .qz-final-score {
          font-size: 28px;
          font-weight: 800;
          color: var(--violet-light);
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .qz-final-score-pct {
          font-size: 16px;
          color: var(--muted);
          font-weight: 600;
        }

        /* Friends list */
        .qz-friends-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .qz-friends-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .qz-friends-list {
          display: flex;
          flex-direction: column;
          border-radius: var(--r-md);
          border: 1px solid var(--line);
          overflow: hidden;
          background: var(--surface-2);
        }
        .qz-friend-row {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line-soft);
          transition: background 0.15s var(--ease-out);
        }
        .qz-friend-row:last-child {
          border-bottom: none;
        }
        .qz-friend-row--top {
          background: rgba(180, 155, 255, 0.06);
        }
        .qz-friend-row--you {
          background: rgba(236, 226, 58, 0.06);
          border-top: 1px solid rgba(236, 226, 58, 0.2) !important;
        }
        .qz-friend-rank {
          width: 22px;
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          flex-shrink: 0;
        }
        .qz-friend-row--top .qz-friend-rank {
          color: var(--violet-light);
        }
        .qz-friend-row--you .qz-friend-rank {
          color: var(--lemon-vivid);
        }
        .qz-friend-av {
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          border: 1px solid var(--line);
        }
        .qz-friend-info {
          flex: 1;
          min-width: 0;
        }
        .qz-friend-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .qz-friend-row--you .qz-friend-name {
          color: var(--lemon-vivid);
        }
        .qz-friend-time {
          font-size: 11px;
          color: var(--muted);
          margin-top: 1px;
        }
        .qz-friend-result {
          font-size: 14px;
          font-weight: 700;
          color: var(--ink-2);
          flex-shrink: 0;
          letter-spacing: -0.01em;
        }
        .qz-friend-row--top .qz-friend-result {
          color: var(--violet-light);
        }
        .qz-friend-row--you .qz-friend-result {
          color: var(--lemon-vivid);
        }

        /* Result actions */
        .qz-result-actions {
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
}

export default QuizGame;
