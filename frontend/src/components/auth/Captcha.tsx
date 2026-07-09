"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * Captcha — the Cloudflare "I'm not a robot" placeholder block repeated across
 * the login / signup / org-signup pages. Self-manages its checked state.
 *
 * Two visual variants preserve each page's existing CSS:
 *   - "login"  → .captcha-check (button) + .captcha-brand + Icon shield
 *   - "signup" → .auth-captcha-check (role=checkbox) + .auth-captcha-logo (inline SVG)
 */

const M = {
  captchaLabel: { en: "I am not a robot", sr: "Nisam robot" },
  notARobot: { en: "I'm not a robot", sr: "Nisam robot" },
  privacyTerms: { en: "Privacy · Terms", sr: "Privatnost · Uslovi" },
} as const;

export function Captcha({ id, variant = "signup" }: { id: string; variant?: "login" | "signup" }) {
  const t = useT(M);
  const [checked, setChecked] = useState(false);

  if (variant === "login") {
    return (
      <div className="auth-captcha">
        <button
          className={`captcha-check${checked ? " checked" : ""}`}
          id={id}
          type="button"
          onClick={() => setChecked((v) => !v)}
          aria-label={t("captchaLabel")}
        >
          <Icon name="check" />
        </button>
        <div className="captcha-info">
          <div className="captcha-text">{t("notARobot")}</div>
          <div className="captcha-sub">{t("privacyTerms")}</div>
        </div>
        <div className="captcha-brand" aria-hidden="true">
          <Icon name="shield" />
          <span>Cloudflare</span>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-captcha">
      <div
        className={`auth-captcha-check${checked ? " checked" : ""}`}
        id={id}
        role="checkbox"
        tabIndex={0}
        aria-checked={checked}
        aria-label={t("captchaLabel")}
        onClick={() => setChecked((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setChecked((v) => !v);
          }
        }}
      >
        <Icon name="check" />
      </div>
      <div className="auth-captcha-info">
        <div className="auth-captcha-text">{t("notARobot")}</div>
        <div className="auth-captcha-sub">{t("privacyTerms")}</div>
      </div>
      <div className="auth-captcha-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
            fill="var(--muted)"
            opacity="0.3"
          />
          <path
            d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v4c0 4.52-3.13 8.69-7 9.93C8.13 20.69 5 16.52 5 12V8l7-3.82z"
            fill="var(--muted)"
          />
        </svg>
        <span>Cloudflare</span>
      </div>
    </div>
  );
}

export default Captcha;
