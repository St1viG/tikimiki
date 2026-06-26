"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * PasswordField — the `.auth-input` password input plus its show/hide toggle
 * and the two 24px eye SVGs (eye-open / eye-closed), previously duplicated four
 * times across the signup and org-signup pages.
 *
 * Self-manages visibility. Controlled value via `value` / `onChange`.
 */

const M = {
  showPassword: { en: "Show password", sr: "Prikaži lozinku" },
  hidePassword: { en: "Hide password", sr: "Sakrij lozinku" },
} as const;

export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  error = false,
  autoComplete = "new-password",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  autoComplete?: string;
}) {
  const t = useT(M);
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-pw-wrap">
      <input
        className={`auth-input${error ? " error" : ""}`}
        type={visible ? "text" : "password"}
        id={id}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="auth-pw-toggle"
        type="button"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        onClick={() => setVisible((v) => !v)}
      >
        <svg
          className="eye-open"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: visible ? "none" : "block" }}
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg
          className="eye-closed"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: visible ? "block" : "none" }}
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
    </div>
  );
}

export default PasswordField;
