"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PasswordField } from "@/components/auth/PasswordField";
import { StrengthMeter, passwordStrength } from "@/components/auth/StrengthMeter";
import { Captcha } from "@/components/auth/Captcha";
import { ApiError } from "@/lib/api";

const M = {
  heading: { en: "Create a tikimiki account", sr: "Kreiraj tikimiki nalog" },
  or: { en: "or", sr: "ili" },
  firstName: { en: "First name", sr: "Ime" },
  lastName: { en: "Last name", sr: "Prezime" },
  email: { en: "Email", sr: "Email" },
  username: { en: "Username", sr: "Korisničko ime" },
  usernameLabel: { en: "Username", sr: "Korisničko ime" },
  password: { en: "Password", sr: "Lozinka" },
  passwordMin: { en: "At least 8 characters", sr: "Najmanje 8 karaktera" },
  confirmPassword: { en: "Confirm password", sr: "Potvrda lozinke" },
  repeatPassword: { en: "Repeat password", sr: "Ponovi lozinku" },
  passwordsMatch: { en: "Passwords match", sr: "Lozinke se poklapaju" },
  passwordsNoMatch: { en: "Passwords do not match", sr: "Lozinke se ne poklapaju" },
  termsAgree: { en: "I agree to the", sr: "Slažem se sa" },
  termsOfUse: { en: "Terms of use", sr: "Uslovima korišćenja" },
  and: { en: "and", sr: "i" },
  privacyPolicy: { en: "Privacy policy", sr: "Politikom privatnosti" },
  termsError: {
    en: "You must accept the terms of use to continue.",
    sr: "Moraš prihvatiti uslove korišćenja da bi nastavio.",
  },
  createAccount: { en: "Create account", sr: "Kreiraj nalog" },
  creatingAccount: { en: "Creating account…", sr: "Kreiranje naloga…" },
  emailTaken: {
    en: "That email or username is already taken.",
    sr: "Taj email ili korisničko ime je već zauzeto.",
  },
  genericError: {
    en: "Something went wrong. Try again.",
    sr: "Nešto je pošlo naopako. Pokušaj ponovo.",
  },
  alreadyHaveAccount: { en: "Already have an account?", sr: "Već imaš nalog?" },
  signIn: { en: "Sign in", sr: "Prijavi se" },
  registeringForOrg: {
    en: "Registering on behalf of a company?",
    sr: "Registruješ se u ime firme?",
  },
  createOrgAccount: { en: "Create organization account", sr: "Kreiraj organizacioni nalog" },
} as const;

export function SignupClient() {
  const t = useT(M);
  const router = useRouter();
  const { register } = useAuth();

  // Password value + strength
  const [password, setPassword] = useState("");
  // Derived on every render — avoids a separate state value that would lag by one render.
  const strength = passwordStrength(password);

  // Confirm password
  const [confirmPw, setConfirmPw] = useState("");

  // Terms
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsError, setTermsError] = useState(false);

  // Identity fields + submit state
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only show the match/mismatch message once the user starts typing in the confirm field.
  const matchVisible = confirmPw.length > 0;
  const matchOk = password === confirmPw;

  const handleTermsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTermsChecked(e.target.checked);
    if (e.target.checked) setTermsError(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!termsChecked) {
      setTermsError(true);
      return;
    }
    if (!matchOk) return;
    setSubmitError(null);
    setLoading(true);
    try {
      await register({ username, email, password, accountType: "member" });
      router.push("/");
    } catch (err) {
      setSubmitError(
        err instanceof ApiError && err.status === 409 ? t("emailTaken") : t("genericError"),
      );
    } finally {
      setLoading(false);
    }
  }, [termsChecked, matchOk, username, email, password, router, t]);

  return (
    <AuthShell wrapWordmark>
      <main className="auth-card" id="auth-form">
        <h1 className="auth-heading">{t("heading")}</h1>

        {/* OAuth providers (Google + GitHub; LinkedIn removed — no provider wired) */}
        <OAuthButtons variant="row" />

        {/* Divider */}
        <div className="auth-divider">
          <span className="auth-divider-text">{t("or")}</span>
        </div>

        {/* Form */}
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="auth-two-col">
            <div className="auth-field">
              <label className="auth-label" htmlFor="first-name">
                {t("firstName")}
              </label>
              <input className="auth-input" id="first-name" type="text" placeholder="John" />
            </div>
            <div className="auth-field">
              <label className="auth-label" htmlFor="last-name">
                {t("lastName")}
              </label>
              <input className="auth-input" id="last-name" type="text" placeholder="Smith" />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="email">
              {t("email")}
            </label>
            <input
              className="auth-input"
              id="email"
              type="email"
              placeholder="email@primer.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="username">
              {t("username")}
            </label>
            <div className="auth-input-wrap">
              <span className="auth-input-prefix" aria-hidden="true">
                @
              </span>
              <input
                className="auth-input has-prefix"
                id="username"
                type="text"
                placeholder="username"
                aria-label={t("usernameLabel")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          {/* Password */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="pw-signup">
              {t("password")}
            </label>
            <PasswordField
              id="pw-signup"
              value={password}
              onChange={setPassword}
              placeholder={t("passwordMin")}
            />
            <StrengthMeter strength={strength} />
          </div>

          {/* Confirm password */}
          <div className="auth-field">
            <label className="auth-label" htmlFor="pw-confirm">
              {t("confirmPassword")}
            </label>
            <PasswordField
              id="pw-confirm"
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder={t("repeatPassword")}
              error={matchVisible && !matchOk}
            />
            <div
              className={`auth-error-msg${matchVisible ? " visible" : ""}${matchVisible && !matchOk ? " error" : ""}${matchVisible && matchOk ? " success" : ""}`}
              id="pw-match-msg"
            >
              {matchVisible ? (matchOk ? t("passwordsMatch") : t("passwordsNoMatch")) : ""}
            </div>
          </div>

          {/* Captcha */}
          <Captcha variant="signup" id="captcha-signup" />

          {/* Terms & conditions */}
          <div className="auth-terms">
            <label className="auth-checkbox-label">
              <input
                type="checkbox"
                id="terms-signup"
                checked={termsChecked}
                onChange={handleTermsChange}
              />
              <span className="auth-checkbox-mark" aria-hidden="true">
                <Icon name="check" />
              </span>
              <span>
                {t("termsAgree")} <a href="#">{t("termsOfUse")}</a> {t("and")}{" "}
                <a href="#">{t("privacyPolicy")}</a>.
              </span>
            </label>
            <div className={`auth-error-msg${termsError ? " visible error" : ""}`} id="terms-msg">
              {termsError ? t("termsError") : ""}
            </div>
          </div>

          {submitError && (
            <div className="auth-error" role="alert">
              {submitError}
            </div>
          )}

          <button
            className="btn btn-primary auth-submit"
            type="button"
            id="submit-signup"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? t("creatingAccount") : t("createAccount")}
          </button>
        </form>

        {/* Switch */}
        <div className="auth-switch">
          {t("alreadyHaveAccount")} <Link href="/login">{t("signIn")}</Link>
        </div>

        {/* Subtle link to organization signup */}
        <Link className="auth-subtle-link" href="/signup/organization">
          {t("registeringForOrg")} <span>{t("createOrgAccount")}</span>
        </Link>
      </main>
    </AuthShell>
  );
}

export default SignupClient;
