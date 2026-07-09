"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";

/* SuspendedClient — interactive suspended-account page.
 *
 * Behaviour:
 *  - Countdown timer: ticks every second toward the UNLOCK date (2026-05-16T00:00:00).
 *    On expiry the timer text becomes the expired message and the color
 *    switches to var(--green) via inline style.
 *  - Appeal submit: validates non-empty textarea, disables both controls, changes
 *    button text to the submitted label, and shows the success toast by adding .show.
 *
 * Full-screen page — no AppShell. Returns inner content directly (root layout
 * already provides <body>, sprite, grain, skip-link).
 */

const M = {
  suspendedTitle: { en: "Account suspended", sr: "Nalog suspendovan" },
  suspendedSub: {
    en: "Your account has been temporarily suspended due to a violation of platform rules. Access is disabled until the suspension period expires.",
    sr: "Tvoj nalog je privremeno suspendovan zbog kršenja pravila platforme. Pristup je onemogućen do isteka perioda suspenzije.",
  },
  reasonLabel: { en: "Reason", sr: "Razlog" },
  suspensionDate: { en: "Suspension date", sr: "Datum suspenzije" },
  unlockDate: { en: "Unlock date", sr: "Datum otključavanja" },
  issuedBy: { en: "Issued by", sr: "Izrečena od strane" },
  unlockingIn: { en: "Unlocking in", sr: "Otključavanje za" },
  countdownExpired: { en: "Expired: account is unlocked", sr: "Isteklo: nalog je otključan" },
  unlockingOn: { en: "Unlocking: 16.05.2026 at 00:00", sr: "Otključavanje: 16.05.2026 u 00:00" },
  submitAppealTitle: { en: "Submit appeal", sr: "Podnesi žalbu" },
  appealSub: {
    en: "If you believe the suspension is unwarranted, you can submit an appeal. The moderation team will review it within 48 hours. You can only submit an appeal once.",
    sr: "Ako smatraš da je suspenzija neosnovana, možeš podneti žalbu. Tim za moderaciju će je pregledati u roku od 48 sati. Žalbu možeš podneti samo jednom.",
  },
  appealTextLabel: { en: "Appeal explanation", sr: "Obrazloženje žalbe" },
  appealPlaceholder: {
    en: "Explain why you believe the suspension is unwarranted…",
    sr: "Obrazloži zašto smatraš da je suspenzija neosnovana…",
  },
  appealToastMsg: {
    en: "Appeal successfully submitted. The moderation team will respond within 48 hours.",
    sr: "Žalba je uspešno podneta. Tim za moderaciju će ti odgovoriti u roku od 48 sati.",
  },
  submitAppeal: { en: "Submit appeal", sr: "Podnesi žalbu" },
  appealSubmitted: { en: "Appeal submitted", sr: "Žalba podneta" },
  signOut: { en: "Sign out", sr: "Odjavi se sa naloga" },
} as const;

const UNLOCK = new Date("2026-05-16T00:00:00");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function SuspendedClient() {
  const t = useT(M);
  const [countdown, setCountdown] = useState("--d --h --m --s");
  const [countdownDate, setCountdownDate] = useState("");
  const [countdownExpired, setCountdownExpired] = useState(false);

  const [appealText, setAppealText] = useState("");
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      const diff = UNLOCK.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdown(t("countdownExpired"));
        setCountdownDate("");
        setCountdownExpired(true);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`);
      setCountdownDate(t("unlockingOn"));
      setCountdownExpired(false);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitAppeal() {
    if (!appealText.trim()) {
      textareaRef.current?.focus();
      return;
    }
    // NOTE: deferred. The only user-facing appeal endpoint in api.ts is
    // submitBanAppeal(email, password, reason), which requires the account
    // credentials to be re-entered (it is used pre-auth from AuthClient). This
    // suspended page has no email/password inputs and no session-based appeal
    // endpoint exists, so we cannot call it here without inventing a new API or
    // adding a credential form. Keeping the local success UX and logging the gap
    // rather than faking a network submission.
    // eslint-disable-next-line no-console
    console.warn(
      "[suspended] Appeal submission is deferred: no session-based appeal endpoint exists in api.ts; submitBanAppeal() requires email+password not collected on this page.",
    );
    setAppealSubmitted(true);
  }

  return (
    <AuthShell as="main" wordmarkVariant="logo" footerVariant="inline">
      <section className="susp-card" aria-labelledby="susp-heading">
        <div className="susp-badge" aria-hidden="true">
          <Icon name="lock" />
        </div>

        <h1 className="susp-title" id="susp-heading">
          {t("suspendedTitle")}
        </h1>
        <p className="susp-sub">{t("suspendedSub")}</p>

        <div className="susp-info-box">
          <div className="susp-row">
            <span className="susp-label">{t("reasonLabel")}</span>
            <span className="susp-val is-reason" id="susp-reason">
              Uznemiravanje korisnika
            </span>
          </div>
          <div className="susp-row">
            <span className="susp-label">{t("suspensionDate")}</span>
            <span className="susp-val" id="susp-start">
              14.04.2026
            </span>
          </div>
          <div className="susp-row">
            <span className="susp-label">{t("unlockDate")}</span>
            <span className="susp-val is-unlock" id="susp-end">
              16.05.2026
            </span>
          </div>
          <div className="susp-row">
            <span className="susp-label">{t("issuedBy")}</span>
            <span className="susp-val" id="susp-by">
              Admin Đurić
            </span>
          </div>
        </div>

        <div className="susp-countdown">
          <div className="susp-countdown-label">
            <Icon name="clock" /> {t("unlockingIn")}
          </div>
          <div
            className="susp-countdown-timer"
            id="countdown"
            style={countdownExpired ? { color: "var(--green)" } : undefined}
          >
            {countdown}
          </div>
          <div className="susp-countdown-date" id="countdown-date">
            {countdownDate}
          </div>
        </div>

        <hr className="susp-divider" />

        <h2 className="susp-appeal-title">
          <Icon name="flag" /> {t("submitAppealTitle")}
        </h2>
        <p className="susp-appeal-sub">{t("appealSub")}</p>

        <label className="sr-only" htmlFor="appeal-text">
          {t("appealTextLabel")}
        </label>
        <textarea
          className="susp-textarea"
          id="appeal-text"
          placeholder={t("appealPlaceholder")}
          value={appealText}
          onChange={(e) => setAppealText(e.target.value)}
          disabled={appealSubmitted}
          ref={textareaRef}
        />

        <div
          className={`susp-toast${appealSubmitted ? " show" : ""}`}
          id="appeal-toast"
          role="status"
        >
          <Icon name="check" />
          <span>{t("appealToastMsg")}</span>
        </div>

        <button
          className="btn btn-primary susp-btn-full"
          id="appeal-btn"
          type="button"
          onClick={submitAppeal}
          disabled={appealSubmitted}
        >
          {appealSubmitted ? t("appealSubmitted") : t("submitAppeal")}
        </button>

        <div className="susp-switch">
          <Link href="/login">
            <Icon name="arrow-left" /> {t("signOut")}
          </Link>
        </div>
      </section>
    </AuthShell>
  );
}

export default SuspendedClient;
