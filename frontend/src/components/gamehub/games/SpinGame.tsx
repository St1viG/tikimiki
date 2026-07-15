"use client";

/**
 * SpinGame — Daily Spin wheel modal for tikimiki GameHub.
 *
 * Implements GameModalProps: renders a fixed overlay + dialog when `open`,
 * closes on X / backdrop / ESC via `onClose`, and calls `onComplete` once
 * when the wheel settles. The winning segment is derived deterministically
 * from makeRng("spin-" + todayKey()) so every user sees the same prize today.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameModalProps } from "@/lib/gamehub/types";
import { todayKey } from "@/lib/gamehub/types";
import { FRIEND_PLAYS, STREAKS } from "@/lib/gamehub/mock";
import { makeRng } from "@/lib/avatars/core";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/* UI chrome strings (the prize table + friend sample data stay Serbian). */
const M = {
  close: { en: "Close", sr: "Zatvori" },
  wheelAria: { en: "Wheel of fortune", sr: "Točak sreće" },
  titleSub: {
    en: "Once a day: spin the wheel and win a prize",
    sr: "Jednom dnevno: okreni točak i osvoji nagradu",
  },
  daysInRow: { en: "days in a row", sr: "dana zaredom" },
  spin: { en: "Spin", sr: "Okreni" },
  spinning: { en: "The wheel is spinning…", sr: "Točak se vrti..." },
  nextSpin: { en: "Next spin in:", sr: "Sledeći spin za:" },
  friendsToday: { en: "Friends today", sr: "Prijatelji danas" },
  // Result toasts
  toastMiss: {
    en: "No prize this time — better luck tomorrow!",
    sr: "Nisi zaradio nagradu — sreća sutra!",
  },
  toastSkin: {
    en: "Congrats! You won {label}!",
    sr: "Čestitamo! Osvojio si {label}!",
  },
  toastRare: { en: "INCREDIBLE! Rare prize!", sr: "NEVEROVATNO! Rare nagrada!" },
  toastWin: { en: "Great! You earned {label}!", sr: "Sjajno! Zaradio si {label}!" },
} as const;

/* Prize table */

interface Prize {
  label: string;
  type: "xp" | "skin" | "miss" | "rare";
}

const PRIZES: Prize[] = [
  { label: "+50 XP", type: "xp" },
  { label: "KOHOR Skin", type: "skin" },
  { label: "+100 XP", type: "xp" },
  { label: "Promašaj", type: "miss" },
  { label: "+25 XP", type: "xp" },
  { label: "+200 XP", type: "xp" },
  { label: "Rare Bonus", type: "rare" },
  { label: "+75 XP", type: "xp" },
];

/* Segment background fills and label colours (brand palette, no hardcoded tokens) */
const SEG_COLORS = [
  "#1A0E3D",
  "#2A0028",
  "#1C1A00",
  "#17172A",
  "#1A0E3D",
  "#04342C",
  "#1C1A00",
  "#17172A",
];
const TEXT_COLORS = [
  "#A78BFA",
  "#ff9ff3",
  "#ffe734",
  "#7A7690",
  "#A78BFA",
  "#5DCAA5",
  "#ffe734",
  "#7A7690",
];

const N = PRIZES.length;
const SEG = (2 * Math.PI) / N;
const SPIN_DURATION = 4200; // ms

/* Deterministic daily winner */

function getDailyWinner(): number {
  const rng = makeRng("spin-" + todayKey());
  return rng.int(0, N - 1);
}

/* Easing: 1-(1-t)^4 */

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/* Canvas draw */

function drawWheel(ctx: CanvasRenderingContext2D, angle: number, size: number): void {
  const R = size / 2;
  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < N; i++) {
    const start = angle + i * SEG;
    const end = start + SEG;
    const mid = start + SEG / 2;

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(R, R);
    ctx.arc(R, R, R - 2, start, end);
    ctx.closePath();
    ctx.fillStyle = SEG_COLORS[i];
    ctx.fill();

    // Subtle divider
    ctx.beginPath();
    ctx.moveTo(R, R);
    ctx.arc(R, R, R - 2, start, end);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = TEXT_COLORS[i];
    ctx.font = `bold ${Math.round(size * 0.034)}px "Space Grotesk", sans-serif`;
    ctx.fillText(PRIZES[i].label, R - Math.round(size * 0.037), 0);
    ctx.restore();
  }

  // Outer ring
  ctx.beginPath();
  ctx.arc(R, R, R - 2, 0, 2 * Math.PI);
  ctx.strokeStyle = "#2A2550";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Center cap
  ctx.beginPath();
  ctx.arc(R, R, Math.round(size * 0.027), 0, 2 * Math.PI);
  ctx.fillStyle = "#07070D";
  ctx.fill();
  ctx.strokeStyle = "#B49BFF";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* Cooldown helpers */

function secondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

function formatCountdown(secs: number): string {
  const h = String(Math.floor(secs / 3600)).padStart(2, "0");
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* Friend comparison helpers */

function prizeToastText(prize: Prize, t: (k: keyof typeof M) => string): string {
  if (prize.type === "miss") return t("toastMiss");
  if (prize.type === "skin") return t("toastSkin").replace("{label}", prize.label);
  if (prize.type === "rare") return t("toastRare");
  return t("toastWin").replace("{label}", prize.label);
}

/* Component */

export function SpinGame({ open, onClose, onComplete }: GameModalProps) {
  const t = useT(M);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Angle state kept in a ref so RAF doesn't re-create on every frame.
  const currentAngleRef = useRef<number>(0);
  const startAngleRef = useRef<number>(0);
  const targetAngleRef = useRef<number>(0);

  // UI state
  const [phase, setPhase] = useState<"idle" | "spinning" | "result">("idle");
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState<number>(0);

  // The daily winner index is fixed per day.
  const winIdx = getDailyWinner();

  /* Render wheel whenever canvas becomes visible. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawWheel(ctx, currentAngleRef.current, canvas.width);
  }, []);

  /* Draw initial wheel on mount and whenever modal opens. */
  useEffect(() => {
    if (!open) return;
    // Reset to idle if re-opened.
    if (phase === "result") return;
    // Short rAF to ensure canvas has rendered in the DOM.
    const id = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(id);
  }, [open, paint, phase]);

  /* ESC to close. */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Cooldown ticker — runs after result. */
  useEffect(() => {
    if (phase !== "result") return;
    let secs = secondsUntilMidnight();
    setCooldownSecs(secs);
    const iv = setInterval(() => {
      secs -= 1;
      if (secs <= 0) {
        clearInterval(iv);
        return;
      }
      setCooldownSecs(secs);
    }, 1000);
    return () => clearInterval(iv);
  }, [phase]);

  /* Body scroll lock. */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* Animation loop. */
  function animateSpin(ts: number) {
    if (startTimeRef.current === null) startTimeRef.current = ts;
    const elapsed = ts - startTimeRef.current;
    const t = Math.min(elapsed / SPIN_DURATION, 1);
    const angle =
      startAngleRef.current + (targetAngleRef.current - startAngleRef.current) * easeOut(t);
    currentAngleRef.current = angle;

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) drawWheel(ctx, angle, canvas.width);
    }

    if (t < 1) {
      rafRef.current = requestAnimationFrame(animateSpin);
    } else {
      // Settle
      currentAngleRef.current = targetAngleRef.current % (2 * Math.PI);
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) drawWheel(ctx, currentAngleRef.current, canvas.width);
      }
      const prize = PRIZES[winIdx];
      setWonPrize(prize);
      setPhase("result");
      // raw is the XP integer so the backend can record it; non-XP prizes send 0 and are handled by prize.type.
      onComplete?.({
        kind: "reward",
        display: prize.type === "miss" ? "Promašaj" : prize.label,
        raw: prize.type === "xp" ? Number(prize.label.match(/\d+/)?.[0] ?? 0) : 0,
      });
    }
  }

  function handleSpin() {
    if (phase !== "idle") return;
    setPhase("spinning");

    // Compute target angle so that winIdx segment lands under the top pointer (12 o'clock = -π/2 in canvas coords).
    const segMid = winIdx * SEG + SEG / 2;
    const extraSpins = 6 * 2 * Math.PI;
    const rawTarget = -segMid - Math.PI / 2;
    // Double modulo keeps delta positive regardless of the current angle, so the wheel always spins forward.
    const delta =
      (((rawTarget - currentAngleRef.current) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    startAngleRef.current = currentAngleRef.current;
    targetAngleRef.current = currentAngleRef.current + extraSpins + delta;
    startTimeRef.current = null;
    rafRef.current = requestAnimationFrame(animateSpin);
  }

  // Cleanup RAF on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!open) return null;

  const friendPlays = FRIEND_PLAYS["spin"];
  const streak = STREAKS["spin"];

  return (
    <div
      className="sg-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sg-dialog" role="dialog" aria-modal="true" aria-labelledby="sg-title">
        {/* Accent top bar (rendered via ::before in CSS) */}

        {/* Close */}
        <button type="button" className="gm-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="x" />
        </button>

        {/* Header */}
        <div className="sg-head">
          <h2 className="sg-title" id="sg-title">
            Daily <span className="sg-title-accent">Spin</span>
          </h2>
          <p className="sg-sub">{t("titleSub")}</p>

          {/* Streak chip */}
          <div className="sg-streak">
            <Icon name="flame" />
            <span className="u-mono tnum">{streak.current}</span>
            <span className="sg-streak-label">{t("daysInRow")}</span>
          </div>
        </div>

        {/* Wheel area */}
        <div className="sg-wheel-wrap" aria-hidden="true">
          <canvas
            ref={canvasRef}
            className="sg-canvas"
            width={380}
            height={380}
            aria-label={t("wheelAria")}
          />
          {/* Pointer */}
          <div className="sg-pointer">
            <Icon name="chevron-down" />
          </div>
        </div>

        {/* Action area */}
        {phase === "idle" && (
          <button type="button" className="sg-spin-btn btn" onClick={handleSpin}>
            <Icon name="coin" />
            {t("spin")}
          </button>
        )}

        {phase === "spinning" && (
          <div className="sg-spinning-hint">
            <Icon name="coin" />
            {t("spinning")}
          </div>
        )}

        {phase === "result" && wonPrize && (
          <div className="sg-result-area">
            {/* Toast */}
            <div
              className={`sg-toast ${wonPrize.type === "miss" ? "sg-toast-miss" : wonPrize.type === "rare" ? "sg-toast-rare" : "sg-toast-win"}`}
            >
              {wonPrize.type === "rare" && <Icon name="trophy" className="sg-toast-icon" />}
              {wonPrize.type === "xp" && <Icon name="zap" className="sg-toast-icon" />}
              {wonPrize.type === "skin" && <Icon name="star" className="sg-toast-icon" />}
              {wonPrize.type === "miss" && <Icon name="clock" className="sg-toast-icon" />}
              <span>{prizeToastText(wonPrize, t)}</span>
            </div>

            {/* Cooldown */}
            <div className="sg-cooldown">
              <Icon name="clock" />
              <span>{t("nextSpin")}</span>
              <span className="u-mono tnum sg-timer">{formatCountdown(cooldownSecs)}</span>
            </div>

            {/* Friends comparison */}
            <div className="sg-friends-section">
              <div className="sg-friends-label">
                <Icon name="sparkles" />
                <span>{t("friendsToday")}</span>
              </div>
              <div className="sg-friends-list">
                {friendPlays.map((fp) => (
                  <div key={fp.handle} className="sg-friend-row">
                    <div className="sg-friend-av">
                      <GenerativeAvatar seed={fp.handle} variant="orbit" size={34} />
                    </div>
                    <div className="sg-friend-info">
                      <span className="sg-friend-name">{fp.name}</span>
                      <span className="sg-friend-meta">
                        <span className="u-mono tnum sg-friend-result">{fp.result.display}</span>
                        <span className="sg-friend-time">{fp.playedAt}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Done button */}
            <button type="button" className="btn btn-ghost sg-done-btn" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        )}
      </div>

      <style>{`
        /* SpinGame overlay */
        .sg-overlay {
          position: fixed;
          inset: 0;
          z-index: var(--z-modal);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(6, 6, 12, .82);
          backdrop-filter: blur(8px);
          animation: sg-fade var(--dur-1, .22s) var(--ease-out) both;
        }
        @keyframes sg-fade { from { opacity: 0; } to { opacity: 1; } }

        .sg-dialog {
          position: relative;
          width: 520px;
          max-width: 100%;
          max-height: calc(100dvh - 40px);
          overflow-y: auto;
          background: linear-gradient(180deg, var(--surface-2), var(--surface) 46%);
          border: 1px solid var(--line);
          border-radius: var(--r);
          box-shadow: 0 30px 70px -30px rgba(0,0,0,.9);
          padding: 34px 32px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          animation: sg-rise var(--dur-2, .3s) var(--ease-quint) both;
        }
        @keyframes sg-rise {
          from { opacity: 0; transform: translateY(14px) scale(.97); }
          to   { opacity: 1; transform: none; }
        }
        /* Lemon-to-violet accent bar at top */
        .sg-dialog::before {
          content: "";
          position: absolute;
          left: 0; right: 0; top: 0;
          height: 2px;
          border-radius: var(--r) var(--r) 0 0;
          background: linear-gradient(90deg, var(--lemon), var(--violet-light) 60%, transparent);
          pointer-events: none;
        }

        /* Header */
        .sg-head {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          margin-bottom: 20px;
          text-align: center;
        }
        .sg-title {
          font-family: var(--display);
          font-weight: 800;
          font-size: clamp(22px, 1.4rem + 1vw, 28px);
          letter-spacing: -.025em;
          color: var(--ink);
          margin: 0;
        }
        .sg-title-accent { color: var(--lemon); }
        .sg-sub { font-size: 13px; color: var(--muted); margin: 0; }
        .sg-streak {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 11px;
          border-radius: var(--r-pill, 999px);
          background: rgba(236,226,58,.1);
          border: 1px solid rgba(236,226,58,.28);
          color: var(--lemon-vivid);
          font-size: 13px;
          font-weight: 700;
          margin-top: 6px;
        }
        .sg-streak .ic { width: 13px; height: 13px; }
        .sg-streak-label { color: var(--muted); font-weight: 500; font-size: 12px; margin-left: 1px; }

        /* Wheel wrapper */
        .sg-wheel-wrap {
          position: relative;
          width: 340px;
          height: 340px;
          max-width: 100%;
          flex-shrink: 0;
          margin-bottom: 22px;
        }
        .sg-canvas {
          display: block;
          width: 100%;
          height: auto;
          border-radius: 50%;
          box-shadow: 0 0 0 2px var(--line), 0 0 32px -8px rgba(180,155,255,.25);
        }
        /* Pointer arrow at top */
        .sg-pointer {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
          color: var(--lemon-vivid);
          filter: drop-shadow(0 0 8px rgba(237,217,75,.6));
          pointer-events: none;
        }
        .sg-pointer .ic { width: 26px; height: 26px; }

        /* Spin button */
        .sg-spin-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 30px;
          background: var(--violet);
          color: var(--lemon);
          font-family: var(--body);
          font-weight: 700;
          font-size: 15px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: background var(--dur-1, .15s) var(--ease-out),
                      transform var(--dur-1, .15s) var(--ease-out),
                      box-shadow var(--dur-1, .15s) var(--ease-out);
          box-shadow: var(--glow-violet);
          margin-bottom: 4px;
        }
        .sg-spin-btn .ic { width: 17px; height: 17px; }
        .sg-spin-btn:hover {
          background: var(--violet-light);
          transform: translateY(-2px);
          box-shadow: 0 0 24px -4px rgba(180,155,255,.55);
        }
        .sg-spin-btn:active { transform: scale(.95); }

        /* Spinning hint */
        .sg-spinning-hint {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          color: var(--muted);
          animation: sg-pulse 1.2s ease-in-out infinite;
          margin-bottom: 4px;
        }
        .sg-spinning-hint .ic { width: 16px; height: 16px; color: var(--lemon); }
        @keyframes sg-pulse {
          0%, 100% { opacity: .55; }
          50%       { opacity: 1; }
        }

        /* Result area */
        .sg-result-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          width: 100%;
        }

        /* Toast */
        .sg-toast {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 18px;
          border-radius: var(--r-sm, 10px);
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          text-align: center;
          width: 100%;
          justify-content: center;
          animation: sg-toast-in var(--dur-2, .3s) var(--ease-out) both;
        }
        @keyframes sg-toast-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .sg-toast-win {
          background: rgba(180,155,255,.1);
          border: 1px solid rgba(180,155,255,.3);
          color: var(--violet-light);
        }
        .sg-toast-rare {
          background: rgba(237,217,75,.1);
          border: 1px solid rgba(237,217,75,.35);
          color: var(--lemon-vivid);
          box-shadow: var(--glow-lemon);
        }
        .sg-toast-miss {
          background: var(--surface-2);
          border: 1px solid var(--line);
          color: var(--muted);
        }
        .sg-toast-icon { width: 17px; height: 17px; flex-shrink: 0; }

        /* Cooldown line */
        .sg-cooldown {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--muted);
        }
        .sg-cooldown .ic { width: 14px; height: 14px; flex-shrink: 0; }
        .sg-timer {
          color: var(--ink-2);
          font-size: 13px;
          letter-spacing: -.01em;
        }

        /* Friends section */
        .sg-friends-section {
          width: 100%;
          background: rgba(21,17,44,.55);
          border: 1px solid var(--line-soft);
          border-radius: var(--r-sm, 10px);
          overflow: hidden;
        }
        .sg-friends-label {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 10px 14px 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted);
          border-bottom: 1px solid var(--line-soft);
        }
        .sg-friends-label .ic { width: 13px; height: 13px; color: var(--violet-light); }

        .sg-friends-list { display: flex; flex-direction: column; }
        .sg-friend-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 14px;
        }
        .sg-friend-row + .sg-friend-row { border-top: 1px solid var(--line-soft); }

        .sg-friend-av {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          border: 1px solid var(--line);
        }
        .sg-friend-av > * { display: block; width: 100%; height: 100%; }

        .sg-friend-info {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .sg-friend-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }
        .sg-friend-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .sg-friend-result {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--lemon-vivid);
          letter-spacing: -.01em;
        }
        .sg-friend-time {
          font-size: 11.5px;
          color: var(--muted);
        }

        /* Done button */
        .sg-done-btn {
          margin-top: 2px;
          font-size: 13px;
          padding: 9px 24px;
        }

        /* Responsive */
        @media (max-width: 540px) {
          .sg-dialog { padding: 28px 18px 22px; }
          .sg-wheel-wrap { width: 280px; height: 280px; }
        }
      `}</style>
    </div>
  );
}

export default SpinGame;
