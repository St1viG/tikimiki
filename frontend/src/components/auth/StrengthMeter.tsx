"use client";

import { useT } from "@/components/i18n/LanguageProvider";

/**
 * passwordStrength + StrengthMeter — the 4-level password-strength logic and
 * its bar/label UI, previously duplicated in SignupClient (computeStrength) and
 * SignupOrganizationClient (handleStrengthCheck).
 */

export type StrengthLevel = "" | "weak" | "fair" | "good" | "strong";

export function passwordStrength(pw: string): StrengthLevel {
  if (pw.length === 0) return "";
  const hasLetters = /[a-zA-Z]/.test(pw);
  const hasNumbers = /[0-9]/.test(pw);
  const hasSymbols = /[^a-zA-Z0-9]/.test(pw);
  if (pw.length < 8) return "weak";
  if (hasLetters && hasNumbers && hasSymbols) return "strong";
  if (hasLetters && hasNumbers) return "good";
  return "fair";
}

const M = {
  strengthWeak: { en: "Weak", sr: "Slaba" },
  strengthFair: { en: "Fair", sr: "Prihvatljiva" },
  strengthGood: { en: "Good", sr: "Dobra" },
  strengthStrong: { en: "Strong", sr: "Odlična" },
} as const;

export function StrengthMeter({ strength }: { strength: StrengthLevel }) {
  const t = useT(M);

  const label =
    strength === "weak"
      ? t("strengthWeak")
      : strength === "fair"
        ? t("strengthFair")
        : strength === "good"
          ? t("strengthGood")
          : strength === "strong"
            ? t("strengthStrong")
            : "";

  return (
    <>
      <div className={`auth-strength-bars${strength ? ` ${strength}` : ""}`} id="strength-bars">
        <span className="auth-strength-bar"></span>
        <span className="auth-strength-bar"></span>
        <span className="auth-strength-bar"></span>
        <span className="auth-strength-bar"></span>
      </div>
      <div className={`auth-strength-text${strength ? ` ${strength}` : ""}`} id="strength-text">
        {label}
      </div>
    </>
  );
}

export default StrengthMeter;
