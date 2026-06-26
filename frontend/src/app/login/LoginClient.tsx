"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { Captcha } from "@/components/auth/Captcha";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import {
  ApiError,
  forgotPassword,
  me,
  refreshSession,
  submitBanAppeal,
} from "@/lib/api";

/**
 * LoginClient — interactive login page.
 *
 * Behaviour:
 *  - Password visibility toggle: swaps input type between "password" and "text",
 *    shows/hides the "Show"/"Hide" labels, updates aria-label.
 *  - Captcha "not a robot" toggle: adds/removes the .checked class on the
 *    captcha-check button, triggering the CSS success-flash animation.
 *  - Remember me checkbox: controlled via React state so .checkbox-mark
 *    inherits the sibling :checked styles naturally.
 *
 * Full-screen layout (no AppShell). The root layout provides body, sprite,
 * grain, and skip-link; this component returns inner content directly.
 */

const M = {
  heading:         { en: "Sign in to tikimiki",          sr: "Prijavi se na tikimiki" },
  emailOrUsername: { en: "Email or username",            sr: "Email ili korisničko ime" },
  password:        { en: "Password",                     sr: "Lozinka" },
  enterPassword:   { en: "Enter your password",          sr: "Unesi lozinku" },
  showPassword:    { en: "Show password",                sr: "Prikaži lozinku" },
  hidePassword:    { en: "Hide password",                sr: "Sakrij lozinku" },
  showLabel:       { en: "Show",                         sr: "Prikaži" },
  hideLabel:       { en: "Hide",                         sr: "Sakrij" },
  rememberMe:      { en: "Remember me",                  sr: "Zapamti me" },
  forgotPassword:  { en: "Forgot password?",             sr: "Zaboravljena lozinka?" },
  signIn:          { en: "Sign in",                      sr: "Prijavi se" },
  signingIn:       { en: "Signing in…",                  sr: "Prijavljivanje…" },
  invalidCreds:    { en: "Invalid email or password.",   sr: "Pogrešan email ili lozinka." },
  genericError:    { en: "Something went wrong. Try again.", sr: "Nešto je pošlo naopako. Pokušaj ponovo." },
  bannedTitle:     { en: "Your account is suspended",    sr: "Tvoj nalog je suspendovan" },
  bannedReason:    { en: "Reason:",                       sr: "Razlog:" },
  appealLabel:     { en: "Submit an appeal",             sr: "Podnesi žalbu" },
  appealPlaceholder:{ en: "Explain why this ban should be lifted…", sr: "Objasni zašto ovaj ban treba ukinuti…" },
  appealSubmit:    { en: "Submit appeal",                 sr: "Pošalji žalbu" },
  appealSubmitting:{ en: "Submitting…",                   sr: "Slanje…" },
  appealSubmitted: { en: "Appeal submitted. We'll review it soon.", sr: "Žalba je poslata. Pregledaćemo je uskoro." },
  appealPending:   { en: "You already have an appeal pending review.", sr: "Već imaš žalbu na čekanju." },
  appealError:     { en: "Could not submit your appeal. Try again.", sr: "Slanje žalbe nije uspelo. Pokušaj ponovo." },
  appealNeedReason:{ en: "Please describe your appeal first.", sr: "Prvo opiši svoju žalbu." },
  forgotNeedEmail: { en: "Enter your email first.",       sr: "Prvo unesi email." },
  forgotSent:      { en: "If that email is registered, a reset link is on its way.", sr: "Ako je taj email registrovan, link za reset stiže uskoro." },
  forgotDevLink:   { en: "Reset link (dev):",             sr: "Link za reset (dev):" },
  orContinueWith:  { en: "or continue with",             sr: "ili nastavi sa" },
  oauthError:      { en: "Could not sign you in. Please try again.", sr: "Prijava nije uspela. Pokušaj ponovo." },
  oauthUnconfigured:{ en: "This sign-in method isn't enabled yet.",  sr: "Ovaj način prijave još nije omogućen." },
  noAccount:       { en: "Don't have an account?",       sr: "Nemaš nalog?" },
  signUp:          { en: "Sign up",                      sr: "Registruj se" },
} as const;

export function LoginClient() {
  const t = useT(M);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [pwVisible, setPwVisible] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannedReason, setBannedReason] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealDone, setAppealDone] = useState(false);

  const togglePw = () => setPwVisible((v) => !v);

  // Handle the OAuth return: the backend redirects back to
  // /login?oauth=success | error | unconfigured.
  const oauthHandled = useRef(false);
  useEffect(() => {
    const oauth = searchParams?.get("oauth");
    if (!oauth || oauthHandled.current) return;
    oauthHandled.current = true;

    if (oauth === "success") {
      (async () => {
        try {
          await refreshSession();
          await me();
          router.push("/");
        } catch {
          setError(t("oauthError"));
        }
      })();
    } else if (oauth === "error") {
      setError(t("oauthError"));
    } else if (oauth === "unconfigured") {
      setInfo(t("oauthUnconfigured"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBannedReason(null);
    setAppealDone(false);
    setAppealError(null);
    setLoading(true);
    try {
      await login({ email: identifier, password });
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        const details = err.details as { banned?: boolean; reason?: string } | undefined;
        if (details?.banned) {
          setBannedReason(details.reason ?? "");
          return;
        }
      }
      setError(
        err instanceof ApiError && err.status === 401
          ? t("invalidCreds")
          : t("genericError"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppealError(null);
    if (!appealReason.trim()) {
      setAppealError(t("appealNeedReason"));
      return;
    }
    setAppealLoading(true);
    try {
      await submitBanAppeal(identifier, password, appealReason.trim());
      setAppealDone(true);
    } catch (err) {
      setAppealError(
        err instanceof ApiError && err.status === 409
          ? t("appealPending")
          : t("appealError"),
      );
    } finally {
      setAppealLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!identifier.trim()) {
      setInfo(t("forgotNeedEmail"));
      return;
    }
    try {
      const res = await forgotPassword(identifier.trim());
      setInfo(
        res.devLink
          ? `${t("forgotSent")} ${t("forgotDevLink")} ${res.devLink}`
          : t("forgotSent"),
      );
    } catch {
      setInfo(t("forgotSent"));
    }
  };

  return (
    <AuthShell wordmarkVariant="tilted">

      <main className="auth-card">
        <h1 className="auth-heading">{t("heading")}</h1>

        <form onSubmit={handleLogin}>

          <div className="field-group">
            <label className="field-label" htmlFor="login-id">
              {t("emailOrUsername")}
            </label>
            <input
              className="field-input"
              id="login-id"
              name="login-id"
              type="text"
              autoComplete="username"
              placeholder="email@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="pw-login">
              {t("password")}
            </label>
            <div className="pw-wrap">
              <input
                className="field-input"
                type={pwVisible ? "text" : "password"}
                id="pw-login"
                name="password"
                autoComplete="current-password"
                placeholder={t("enterPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="pw-toggle"
                type="button"
                onClick={togglePw}
                aria-label={pwVisible ? t("hidePassword") : t("showPassword")}
              >
                <span className="eye-open" style={{ display: pwVisible ? "none" : undefined }}>
                  {t("showLabel")}
                </span>
                <span className="eye-closed" style={{ display: pwVisible ? undefined : "none" }}>
                  {t("hideLabel")}
                </span>
              </button>
            </div>
          </div>

          <div className="auth-remember">
            <label className="checkbox-label">
              <input type="checkbox" />
              <span className="checkbox-mark" aria-hidden="true">
                <Icon name="check" />
              </span>
              {t("rememberMe")}
            </label>
            <button
              className="auth-textlink"
              type="button"
              onClick={handleForgotPassword}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              {t("forgotPassword")}
            </button>
          </div>

          {/* Captcha (Cloudflare Turnstile placeholder) */}
          <Captcha variant="login" id="captcha-login" />

          {error && (
            <div
              className="auth-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {bannedReason !== null && (
            <div
              className="auth-banned"
              role="alert"
              style={{
                marginBottom: "0.9rem",
                padding: "0.85rem",
                border: "1px solid var(--red)",
                borderRadius: "10px",
                fontSize: "0.85rem",
              }}
            >
              <strong style={{ color: "var(--red)", display: "block", marginBottom: "0.35rem" }}>
                {t("bannedTitle")}
              </strong>
              {bannedReason && (
                <p style={{ margin: "0 0 0.65rem", opacity: 0.9 }}>
                  {t("bannedReason")} {bannedReason}
                </p>
              )}

              {appealDone ? (
                <p className="auth-success" style={{ margin: 0 }}>{t("appealSubmitted")}</p>
              ) : (
                <div className="field-group" style={{ marginBottom: 0 }}>
                  <label className="field-label" htmlFor="appeal-reason">
                    {t("appealLabel")}
                  </label>
                  <textarea
                    className="field-input"
                    id="appeal-reason"
                    name="appeal-reason"
                    rows={3}
                    placeholder={t("appealPlaceholder")}
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    style={{ resize: "vertical" }}
                  />
                  {appealError && (
                    <div
                      className="auth-error"
                      role="alert"
                      style={{ fontSize: "0.8rem", marginTop: "0.4rem", marginBottom: 0 }}
                    >
                      {appealError}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    style={{ marginTop: "0.6rem" }}
                    disabled={appealLoading}
                    onClick={handleAppeal}
                  >
                    {appealLoading ? t("appealSubmitting") : t("appealSubmit")}
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? t("signingIn") : t("signIn")}
          </button>

        </form>

        {/* Divider */}
        <div className="auth-divider"><span>{t("orContinueWith")}</span></div>

        {info && (
          <div
            className="auth-info"
            role="status"
            style={{ fontSize: "0.85rem", marginBottom: "0.75rem", opacity: 0.85 }}
          >
            {info}
          </div>
        )}

        {/* OAuth providers (Google + GitHub; LinkedIn removed — no provider wired) */}
        <OAuthButtons variant="stacked" />

        {/* Switch */}
        <div className="auth-switch">
          {t("noAccount")} <Link href="/signup">{t("signUp")}</Link>
        </div>

      </main>

    </AuthShell>
  );
}

export default LoginClient;
