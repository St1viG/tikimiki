"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { ApiError, resetPassword } from "@/lib/api";

/**
 * ResetPasswordClient — sets a new password from a reset token.
 *
 * Reads ?token from the URL, collects a new password + confirmation, and POSTs
 * them. Validates a minimum length of 8 and that the two fields match before
 * calling the API. On success shows a confirmation with a link to /login.
 * Reuses the auth-card styles from login.css (imported by the server page).
 */

const MIN_PASSWORD = 8;

const M = {
  heading:       { en: "Choose a new password",          sr: "Izaberi novu lozinku" },
  newPassword:   { en: "New password",                   sr: "Nova lozinka" },
  newPlaceholder:{ en: "At least 8 characters",          sr: "Najmanje 8 karaktera" },
  confirm:       { en: "Confirm password",               sr: "Potvrdi lozinku" },
  confirmPlaceholder:{ en: "Re-enter your password",     sr: "Ponovo unesi lozinku" },
  submit:        { en: "Reset password",                 sr: "Resetuj lozinku" },
  submitting:    { en: "Resetting…",                     sr: "Resetovanje…" },
  missingToken:  { en: "This reset link is missing its token.", sr: "Ovom linku za reset nedostaje token." },
  tooShort:      { en: "Password must be at least 8 characters.", sr: "Lozinka mora imati najmanje 8 karaktera." },
  mismatch:      { en: "Passwords do not match.",        sr: "Lozinke se ne poklapaju." },
  invalidToken:  { en: "This reset link is invalid or has expired.", sr: "Ovaj link za reset je nevažeći ili je istekao." },
  genericError:  { en: "Could not reset your password. Try again.", sr: "Resetovanje lozinke nije uspelo. Pokušaj ponovo." },
  success:       { en: "Password updated",               sr: "Lozinka je ažurirana" },
  successBody:   { en: "Your password has been changed. You can sign in now.", sr: "Tvoja lozinka je promenjena. Sada se možeš prijaviti." },
  goToLogin:     { en: "Continue to sign in",            sr: "Nastavi na prijavu" },
} as const;

export function ResetPasswordClient() {
  const t = useT(M);
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(t("missingToken"));
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(t("tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(
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

        {done ? (
          <div role="status">
            <p className="auth-success">
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
          <form onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="new-password">
                {t("newPassword")}
              </label>
              <input
                className="field-input"
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                placeholder={t("newPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="confirm-password">
                {t("confirm")}
              </label>
              <input
                className="field-input"
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder={t("confirmPlaceholder")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
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
