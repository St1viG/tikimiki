"use client";

import { useState } from "react";
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

/**
 * SignupOrganizationClient — interactive org-signup page.
 *
 * Registers an organization account through the shared auth flow: the form
 * fields are controlled and submitted via register(...) from useAuth() with
 * accountType "organization" + organizationName (mirrors the member SignupClient,
 * and the RegisterBody / backend schema both support the organization shape).
 *
 * Full-screen route — no AppShell, no shell/grain/skip-link (root layout provides them).
 */

const M = {
  heading:            { en: "Register organization",                       sr: "Registruj organizaciju" },
  approvalNotice:     { en: "Organization accounts go through admin approval before activation. After confirming your email address, your request is forwarded to the admin team. A notification about the outcome will arrive by email.", sr: "Organizacioni nalozi prolaze kroz administratorsko odobravanje pre aktivacije. Nakon potvrde email adrese, tvoj zahtev se prosleđuje admin timu. Obaveštenje o ishodu stiže na email." },
  or:                 { en: "or",                                          sr: "ili" },
  orgName:            { en: "Organization name",                           sr: "Naziv organizacije" },
  emailAddress:       { en: "Email address",                               sr: "Email adresa" },
  username:           { en: "Username",                                    sr: "Korisničko ime" },
  password:           { en: "Password",                                    sr: "Lozinka" },
  passwordMin:        { en: "At least 8 characters",                       sr: "Najmanje 8 karaktera" },
  confirmPassword:    { en: "Confirm password",                            sr: "Potvrda lozinke" },
  repeatPassword:     { en: "Repeat password",                             sr: "Ponovi lozinku" },
  passwordsMatch:     { en: "Passwords match",                             sr: "Lozinke se poklapaju" },
  passwordsNoMatch:   { en: "Passwords do not match",                      sr: "Lozinke se ne poklapaju" },
  termsAgreeOrg:      { en: "On behalf of the organization I accept the",  sr: "U ime organizacije prihvatam" },
  termsOfUse:         { en: "Terms of use",                                sr: "Uslove korišćenja" },
  and:                { en: "and",                                         sr: "i" },
  privacyPolicy:      { en: "Privacy policy",                              sr: "Politiku privatnosti" },
  termsError:         { en: "You must accept the terms of use to continue.", sr: "Moraš prihvatiti uslove korišćenja da bi nastavio." },
  orgNameRequired:    { en: "Enter your organization's name.",             sr: "Unesi naziv organizacije." },
  passwordTooShort:   { en: "Password must be at least 8 characters.",     sr: "Lozinka mora imati najmanje 8 karaktera." },
  emailTaken:         { en: "That email or username is already taken.",    sr: "Taj email ili korisničko ime je već zauzeto." },
  genericError:       { en: "Something went wrong. Try again.",            sr: "Nešto je pošlo naopako. Pokušaj ponovo." },
  submitRequest:      { en: "Submit request",                              sr: "Podnesi zahtev" },
  submitting:         { en: "Submitting…",                                 sr: "Slanje…" },
  alreadyHaveAccount: { en: "Already have an account?",                    sr: "Već imaš nalog?" },
  signIn:             { en: "Sign in",                                     sr: "Prijavi se" },
  registeringAsIndividual: { en: "Registering as an individual?",          sr: "Registruješ se kao pojedinac?" },
  createUserAccount:  { en: "Create user account",                         sr: "Kreiraj korisnički nalog" },
} as const;

export function SignupOrganizationClient() {
  const t = useT(M);
  const router = useRouter();
  const { register } = useAuth();

  // Identity fields
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");

  // Passwords + strength
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const strength = passwordStrength(password);

  // Terms + submit state
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsMsg, setTermsMsg] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Derived confirm-match state
  const matchVisible = confirmPw.length > 0;
  const matchOk = password === confirmPw;

  // Terms change
  function handleTermsChange(checked: boolean) {
    setTermsChecked(checked);
    if (checked) setTermsMsg("");
  }

  // Submit — register an organization account (mirrors member SignupClient).
  async function handleSubmit() {
    setSubmitError(null);
    if (!termsChecked) {
      setTermsMsg(t("termsError"));
      return;
    }
    if (!orgName.trim()) {
      setSubmitError(t("orgNameRequired"));
      return;
    }
    if (password.length < 8) {
      setSubmitError(t("passwordTooShort"));
      return;
    }
    if (!matchOk) return;

    setLoading(true);
    try {
      await register({
        username,
        email,
        password,
        accountType: "organization",
        organizationName: orgName.trim(),
      });
      router.push("/");
    } catch (err) {
      setSubmitError(
        err instanceof ApiError && err.status === 409
          ? t("emailTaken")
          : t("genericError"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell wrapWordmark>

      <div className="auth-card">

        <h1 className="auth-heading">{t("heading")}</h1>

        {/* Admin approval notice */}
        <div className="auth-info-banner">
          <Icon name="shield" />
          <div className="auth-info-banner-text">
            {t("approvalNotice")}
          </div>
        </div>

        {/* OAuth providers (Google + GitHub; LinkedIn removed — no provider wired) */}
        <OAuthButtons variant="row" />

        {/* Divider */}
        <div className="auth-divider">
          <span className="auth-divider-text">{t("or")}</span>
        </div>

        {/* Form */}
        <form id="auth-form" onSubmit={(e) => e.preventDefault()}>

          <div className="auth-field">
            <label className="auth-label" htmlFor="org-name">{t("orgName")}</label>
            <input
              className="auth-input"
              id="org-name"
              type="text"
              placeholder="npr. Tech for Good d.o.o."
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="org-email">{t("emailAddress")}</label>
            <input
              className="auth-input"
              id="org-email"
              type="email"
              placeholder="kontakt@organizacija.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="org-username">{t("username")}</label>
            <div className="auth-input-wrap">
              <span className="auth-input-prefix" aria-hidden="true">@</span>
              <input
                className="auth-input has-prefix"
                id="org-username"
                type="text"
                placeholder="naziv_organizacije"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="pw-signup">{t("password")}</label>
            <PasswordField
              id="pw-signup"
              value={password}
              onChange={setPassword}
              placeholder={t("passwordMin")}
            />
            <StrengthMeter strength={strength} />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="pw-confirm">{t("confirmPassword")}</label>
            <PasswordField
              id="pw-confirm"
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder={t("repeatPassword")}
              error={matchVisible && !matchOk}
            />
            <div
              className={`auth-error-msg${matchVisible ? ` visible ${matchOk ? "success" : "error"}` : ""}`}
              id="pw-match-msg"
              role="status"
              aria-live="polite"
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
                onChange={(e) => handleTermsChange(e.target.checked)}
              />
              <span className="auth-checkbox-mark" aria-hidden="true">
                <Icon name="check" />
              </span>
              <span>{t("termsAgreeOrg")} <a href="#">{t("termsOfUse")}</a> {t("and")} <a href="#">{t("privacyPolicy")}</a>.</span>
            </label>
            <div
              className={`auth-error-msg${termsMsg ? " visible error" : ""}`}
              id="terms-msg"
              role="status"
              aria-live="polite"
            >
              {termsMsg}
            </div>
          </div>

          {submitError && (
            <div className="auth-error" role="alert">
              {submitError}
            </div>
          )}

          <button
            className="btn btn-primary auth-btn-primary"
            type="button"
            id="submit-signup"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? t("submitting") : t("submitRequest")}
          </button>

        </form>

        {/* Switch */}
        <div className="auth-switch">
          {t("alreadyHaveAccount")} <Link href="/login">{t("signIn")}</Link>
        </div>

        {/* Subtle link back to member signup */}
        <Link className="auth-subtle-link" href="/signup">
          {t("registeringAsIndividual")} <span>{t("createUserAccount")}</span>
        </Link>

      </div>

    </AuthShell>
  );
}

export default SignupOrganizationClient;
