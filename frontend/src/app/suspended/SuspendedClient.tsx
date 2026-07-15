"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT, useLanguage } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { ApiError, submitBanAppeal } from "@/lib/api";
import { readBanInfo, type StoredBanInfo } from "@/lib/banInfo";

/* SuspendedClient — interactive suspended-account page.
 *
 * Real data (SSU21): a banned login attempt stores { reason, bannedAt,
 * expiresAt, identifier } via lib/banInfo and redirects here, so the page
 * shows the actual ban reason and unlock date. No expiresAt = permanent ban
 * (no countdown); no stored info at all = generic copy with "—" values.
 *
 * The appeal form posts to the real POST /auth/appeal endpoint, which
 * authenticates by credentials (a banned user has no session), so it asks
 * for the account password; the email/username is prefilled from the login
 * attempt.
 *
 * Full-screen page — no AppShell. Returns inner content directly (root layout
 * already provides <body>, sprite, grain, skip-link).
 */

const M = {
  suspendedTitle: { en: "Account suspended", sr: "Nalog suspendovan" },
  suspendedSub: {
    en: "Your account has been suspended due to a violation of platform rules. Access is disabled until the suspension is lifted.",
    sr: "Tvoj nalog je suspendovan zbog kršenja pravila platforme. Pristup je onemogućen dok suspenzija ne bude ukinuta.",
  },
  reasonLabel: { en: "Reason", sr: "Razlog" },
  reasonFallback: {
    en: "Violation of platform rules",
    sr: "Kršenje pravila platforme",
  },
  suspensionDate: { en: "Suspension date", sr: "Datum suspenzije" },
  unlockDate: { en: "Unlock date", sr: "Datum otključavanja" },
  permanentBan: { en: "Permanent suspension", sr: "Trajna suspenzija" },
  unlockingIn: { en: "Unlocking in", sr: "Otključavanje za" },
  countdownExpired: { en: "Expired: account is unlocked", sr: "Isteklo: nalog je otključan" },
  unlockingOnPrefix: { en: "Unlocking:", sr: "Otključavanje:" },
  submitAppealTitle: { en: "Submit appeal", sr: "Podnesi žalbu" },
  appealSub: {
    en: "If you believe the suspension is unwarranted, you can submit an appeal. The moderation team will review it. Confirm your identity with your account credentials.",
    sr: "Ako smatraš da je suspenzija neosnovana, možeš podneti žalbu. Tim za moderaciju će je pregledati. Potvrdi identitet podacima svog naloga.",
  },
  identifierLabel: { en: "Email or username", sr: "Email ili korisničko ime" },
  passwordLabel: { en: "Password", sr: "Lozinka" },
  appealTextLabel: { en: "Appeal explanation", sr: "Obrazloženje žalbe" },
  appealPlaceholder: {
    en: "Explain why you believe the suspension is unwarranted…",
    sr: "Obrazloži zašto smatraš da je suspenzija neosnovana…",
  },
  appealToastMsg: {
    en: "Appeal successfully submitted. The moderation team will review it soon.",
    sr: "Žalba je uspešno podneta. Tim za moderaciju će je uskoro pregledati.",
  },
  appealNeedCreds: {
    en: "Enter your email/username and password.",
    sr: "Unesi email/korisničko ime i lozinku.",
  },
  appealInvalidCreds: {
    en: "Invalid credentials — check your email/username and password.",
    sr: "Pogrešni podaci — proveri email/korisničko ime i lozinku.",
  },
  appealPending: {
    en: "You already have an appeal pending review.",
    sr: "Već imaš žalbu na čekanju.",
  },
  appealNotBanned: {
    en: "This account is not suspended.",
    sr: "Ovaj nalog nije suspendovan.",
  },
  appealError: {
    en: "Could not submit your appeal. Try again.",
    sr: "Slanje žalbe nije uspelo. Pokušaj ponovo.",
  },
  submitAppeal: { en: "Submit appeal", sr: "Podnesi žalbu" },
  submittingAppeal: { en: "Submitting…", sr: "Slanje…" },
  appealSubmitted: { en: "Appeal submitted", sr: "Žalba podneta" },
  signOut: { en: "Back to sign in", sr: "Nazad na prijavu" },
} as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function SuspendedClient() {
  const t = useT(M);
  const { locale } = useLanguage();

  // Ban info stored by the login page (null when opened directly).
  const [banInfo, setBanInfo] = useState<StoredBanInfo | null>(null);
  const [countdown, setCountdown] = useState("--d --h --m --s");
  const [countdownDate, setCountdownDate] = useState("");
  const [countdownExpired, setCountdownExpired] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [appealText, setAppealText] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fmtDate = (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  };

  // sessionStorage is browser-only — read it after mount.
  useEffect(() => {
    const info = readBanInfo();
    setBanInfo(info);
    if (info?.identifier) setIdentifier(info.identifier);
  }, []);

  const expiresAtMs = banInfo?.expiresAt ? new Date(banInfo.expiresAt).getTime() : null;

  useEffect(() => {
    // No expiry known (permanent ban or direct visit) — no countdown to run.
    if (expiresAtMs === null || Number.isNaN(expiresAtMs)) return;

    function tick() {
      const diff = (expiresAtMs as number) - Date.now();
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
      setCountdownDate(`${t("unlockingOnPrefix")} ${fmtDate(banInfo?.expiresAt ?? null)}`);
      setCountdownExpired(false);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAtMs, locale]);

  async function submitAppeal() {
    setAppealError(null);
    if (!appealText.trim()) {
      textareaRef.current?.focus();
      return;
    }
    if (!identifier.trim() || !password) {
      setAppealError(t("appealNeedCreds"));
      return;
    }
    setAppealBusy(true);
    try {
      await submitBanAppeal(identifier.trim(), password, appealText.trim());
      setAppealSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAppealError(t("appealInvalidCreds"));
      else if (err instanceof ApiError && err.status === 409) setAppealError(t("appealPending"));
      else if (err instanceof ApiError && err.status === 400) setAppealError(t("appealNotBanned"));
      else setAppealError(t("appealError"));
    } finally {
      setAppealBusy(false);
    }
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
              {banInfo?.reason || t("reasonFallback")}
            </span>
          </div>
          <div className="susp-row">
            <span className="susp-label">{t("suspensionDate")}</span>
            <span className="susp-val" id="susp-start">
              {fmtDate(banInfo?.bannedAt ?? null)}
            </span>
          </div>
          <div className="susp-row">
            <span className="susp-label">{t("unlockDate")}</span>
            <span className="susp-val is-unlock" id="susp-end">
              {banInfo?.expiresAt ? fmtDate(banInfo.expiresAt) : banInfo ? t("permanentBan") : "—"}
            </span>
          </div>
        </div>

        {expiresAtMs !== null && !Number.isNaN(expiresAtMs) && (
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
        )}

        <hr className="susp-divider" />

        <h2 className="susp-appeal-title">
          <Icon name="flag" /> {t("submitAppealTitle")}
        </h2>
        <p className="susp-appeal-sub">{t("appealSub")}</p>

        <label className="sr-only" htmlFor="appeal-identifier">
          {t("identifierLabel")}
        </label>
        <input
          className="field-input"
          id="appeal-identifier"
          type="text"
          autoComplete="username"
          placeholder={t("identifierLabel")}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          disabled={appealSubmitted}
          style={{ marginBottom: "0.6rem" }}
        />
        <label className="sr-only" htmlFor="appeal-password">
          {t("passwordLabel")}
        </label>
        <input
          className="field-input"
          id="appeal-password"
          type="password"
          autoComplete="current-password"
          placeholder={t("passwordLabel")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={appealSubmitted}
          style={{ marginBottom: "0.6rem" }}
        />

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

        {appealError && (
          <div className="auth-error" role="alert" style={{ marginTop: "0.5rem" }}>
            {appealError}
          </div>
        )}

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
          disabled={appealSubmitted || appealBusy}
        >
          {appealSubmitted
            ? t("appealSubmitted")
            : appealBusy
              ? t("submittingAppeal")
              : t("submitAppeal")}
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
