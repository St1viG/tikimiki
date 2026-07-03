"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { ApiError, resetPassword } from "@/lib/api";

/**
 * ResetPasswordClient — sets a new password from an emailed reset token.
 *
 * Reads ?token from the URL (minted by /auth/password/forgot and delivered
 * by email; devLink in development), collects a new password + confirmation,
 * and POSTs them to /auth/password/reset.
 *
 * Validation mirrors the backend contract (resetPasswordSchema: 8–128 chars)
 * and follows the reward-early/punish-late model: errors appear only after a
 * field's first blur (or a failed submit) and clear the moment they're fixed;
 * typing in the confirm field hides its mismatch error until the next blur.
 * A missing token short-circuits to an error state instead of a dead form.
 * Reuses the auth-card styles from login.css (imported by the server page).
 */

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

const M = {
  heading:       { en: "Choose a new password",          sr: "Izaberi novu lozinku" },
  newPassword:   { en: "New password",                   sr: "Nova lozinka" },
  confirm:       { en: "Confirm password",               sr: "Potvrdi lozinku" },
  showLabel:     { en: "Show",                           sr: "Prikaži" },
  hideLabel:     { en: "Hide",                           sr: "Sakrij" },
  showPassword:  { en: "Show password",                  sr: "Prikaži lozinku" },
  hidePassword:  { en: "Hide password",                  sr: "Sakrij lozinku" },
  submit:        { en: "Reset password",                 sr: "Resetuj lozinku" },
  submitting:    { en: "Resetting…",                     sr: "Resetovanje…" },
  pwRequired:    { en: "Enter a new password.",          sr: "Unesi novu lozinku." },
  tooShort:      { en: "Password needs at least 8 characters.", sr: "Lozinka mora imati bar 8 karaktera." },
  tooLong:       { en: "Password can have at most 128 characters.", sr: "Lozinka može imati najviše 128 karaktera." },
  confirmRequired:{ en: "Repeat your new password.",     sr: "Ponovi novu lozinku." },
  mismatch:      { en: "Passwords don't match.",         sr: "Lozinke se ne poklapaju." },
  capsLock:      { en: "Caps Lock is on.",               sr: "Uključen je Caps Lock." },
  missingToken:  { en: "This reset link is missing its token.", sr: "Ovom linku za reset nedostaje token." },
  missingTokenBody:{ en: "Open the link from the reset email again, or request a new one from the sign-in page.", sr: "Otvori link iz mejla ponovo, ili zatraži novi sa strane za prijavu." },
  invalidToken:  { en: "This reset link is invalid or has expired.", sr: "Ovaj link za reset je nevažeći ili je istekao." },
  genericError:  { en: "Could not reset your password. Try again.", sr: "Resetovanje lozinke nije uspelo. Pokušaj ponovo." },
  success:       { en: "Password updated",               sr: "Lozinka je ažurirana" },
  successBody:   { en: "Your password has been changed. You can sign in now.", sr: "Tvoja lozinka je promenjena. Sada se možeš prijaviti." },
  goToLogin:     { en: "Continue to sign in",            sr: "Nastavi na prijavu" },
} as const;

type MsgKey = keyof typeof M;
type Fld = "password" | "confirm";

export function ResetPasswordClient() {
  const t = useT(M);
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [caps, setCaps] = useState<Fld | null>(null);
  const [showErr, setShowErr] = useState<Record<Fld, boolean>>({ password: false, confirm: false });
  const dirty = useRef<Record<Fld, boolean>>({ password: false, confirm: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const pwRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const doneHeadRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (token) pwRef.current?.focus();
  }, [token]);

  useEffect(() => {
    if (done) doneHeadRef.current?.focus();
  }, [done]);

  /* errors computed live, displayed after blur or failed submit */
  const pwErr: MsgKey | null = !password
    ? "pwRequired"
    : password.length < MIN_PASSWORD
      ? "tooShort"
      : password.length > MAX_PASSWORD
        ? "tooLong"
        : null;
  const confirmErr: MsgKey | null = !confirm
    ? "confirmRequired"
    : confirm !== password
      ? "mismatch"
      : null;
  const pwShownErr = showErr.password ? pwErr : null;
  const confirmShownErr = showErr.confirm ? confirmErr : null;

  const markBlur = (f: Fld) => {
    if (dirty.current[f]) setShowErr((s) => (s[f] ? s : { ...s, [f]: true }));
    setCaps((c) => (c === f ? null : c));
  };
  const capsCheck = (f: Fld) => (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCaps(e.getModifierState("CapsLock") ? f : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);

    if (pwErr || confirmErr) {
      setShowErr({ password: true, confirm: true });
      (pwErr ? pwRef : confirmRef).current?.focus();
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setFormError(
        err instanceof ApiError &&
          (err.status === 400 || err.status === 404 || err.status === 410)
          ? t("invalidToken")
          : t("genericError"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell wordmarkVariant="tilted">
      <main className="auth-card">
        <h1 className="auth-heading">{t("heading")}</h1>

        {!token ? (
          <div role="alert">
            <p className="auth-error" style={{ fontWeight: 700 }}>{t("missingToken")}</p>
            <p style={{ fontSize: "0.9rem", opacity: 0.85, marginBottom: "1.1rem" }}>
              {t("missingTokenBody")}
            </p>
            <Link href="/login" className="btn btn-primary btn-block">
              {t("goToLogin")}
            </Link>
          </div>
        ) : done ? (
          <div role="status">
            <p className="auth-success" tabIndex={-1} ref={doneHeadRef} style={{ outline: "none" }}>
              {t("success")}
            </p>
            <p style={{ fontSize: "0.9rem", opacity: 0.85, marginBottom: "1.1rem" }}>
              {t("successBody")}
            </p>
            <Link href="/login" className="btn btn-primary btn-block">
              {t("goToLogin")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label className="field-label" htmlFor="new-password">
                {t("newPassword")}
              </label>
              <div className="pw-wrap">
                <input
                  ref={pwRef}
                  className="field-input"
                  id="new-password"
                  name="new-password"
                  type={pwVisible ? "text" : "password"}
                  autoComplete="new-password"
                  enterKeyHint="next"
                  value={password}
                  onChange={(e) => {
                    dirty.current.password = true;
                    setPassword(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    capsCheck("password")(e);
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmRef.current?.focus();
                    }
                  }}
                  onKeyUp={capsCheck("password")}
                  onBlur={() => markBlur("password")}
                  aria-invalid={pwShownErr ? true : undefined}
                  aria-describedby={pwShownErr ? "new-password-msg" : undefined}
                />
                <button
                  className="pw-toggle"
                  type="button"
                  onClick={() => setPwVisible((v) => !v)}
                  aria-label={pwVisible ? t("hidePassword") : t("showPassword")}
                >
                  {pwVisible ? t("hideLabel") : t("showLabel")}
                </button>
              </div>
              <div aria-live="polite">
                {pwShownErr ? (
                  <p className="auth-error" id="new-password-msg" style={{ margin: "6px 0 0" }}>
                    {t(pwShownErr)}
                  </p>
                ) : caps === "password" ? (
                  <p style={{ color: "var(--warning)", fontSize: ".85rem", margin: "6px 0 0" }}>
                    {t("capsLock")}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="confirm-password">
                {t("confirm")}
              </label>
              <div className="pw-wrap">
                <input
                  ref={confirmRef}
                  className="field-input"
                  id="confirm-password"
                  name="confirm-password"
                  type={confirmVisible ? "text" : "password"}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  value={confirm}
                  onChange={(e) => {
                    dirty.current.confirm = true;
                    setConfirm(e.target.value);
                    /* they're correcting the mismatch; re-show on next blur */
                    setShowErr((s) => (s.confirm ? { ...s, confirm: false } : s));
                  }}
                  onKeyDown={capsCheck("confirm")}
                  onKeyUp={capsCheck("confirm")}
                  onBlur={() => markBlur("confirm")}
                  aria-invalid={confirmShownErr ? true : undefined}
                  aria-describedby={confirmShownErr ? "confirm-password-msg" : undefined}
                />
                <button
                  className="pw-toggle"
                  type="button"
                  onClick={() => setConfirmVisible((v) => !v)}
                  aria-label={confirmVisible ? t("hidePassword") : t("showPassword")}
                >
                  {confirmVisible ? t("hideLabel") : t("showLabel")}
                </button>
              </div>
              <div aria-live="polite">
                {confirmShownErr ? (
                  <p className="auth-error" id="confirm-password-msg" style={{ margin: "6px 0 0" }}>
                    {t(confirmShownErr)}
                  </p>
                ) : caps === "confirm" ? (
                  <p style={{ color: "var(--warning)", fontSize: ".85rem", margin: "6px 0 0" }}>
                    {t("capsLock")}
                  </p>
                ) : null}
              </div>
            </div>

            {formError && (
              <div className="auth-error" role="alert">
                {formError}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>
        )}
      </main>
    </AuthShell>
  );
}

export default ResetPasswordClient;
