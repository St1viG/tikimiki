"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import "./not-found.css";

/**
 * 404 — rendered by Next's App Router for any unmatched route. The root layout
 * supplies <html>/<body>, the fonts, the grain overlay and the providers, so
 * this is a standalone full-viewport composition.
 *
 * Calm "Midnight Voltage" page: the lost mascot stands in for the 0 in 404, a
 * short message, and one clear way back. No glow, no idle animations.
 */
const M = {
  srTitle: { en: "404", sr: "404" },
  title: { en: "This signal went dark.", sr: "Ovaj signal se ugasio." },
  body: {
    en: "The page you're after moved, broke, or never existed.",
    sr: "Stranica koju tražiš je premeštena, pokvarena ili nikad nije postojala.",
  },
  backFeed: { en: "Back to feed", sr: "Nazad na feed" },
  openCohor: { en: "Open Cohor", sr: "Otvori Cohor" },
  aria: { en: "Page not found", sr: "Stranica nije pronađena" },
} as const;

export default function NotFound() {
  const t = useT(M);
  return (
    <main className="nf-root" aria-label={t("aria")}>
      <div className="nf-stack">
        <h1 className="nf-num" aria-label={t("srTitle")}>
          <span aria-hidden="true">4</span>
          <svg className="nf-mascot" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#1A1133" stroke="#3D2E6B" strokeWidth="1.5" />
            <ellipse cx="18" cy="16" rx="5" ry="7" fill="#2D1A55" />
            <ellipse cx="18" cy="16" rx="3" ry="4.5" fill="#7C5CBF" opacity=".6" />
            <ellipse cx="46" cy="16" rx="5" ry="7" fill="#2D1A55" />
            <ellipse cx="46" cy="16" rx="3" ry="4.5" fill="#7C5CBF" opacity=".6" />
            <ellipse cx="32" cy="34" rx="16" ry="14" fill="#2D1A55" />
            <circle cx="26" cy="30" r="4" fill="#1A1133" />
            <circle cx="38" cy="30" r="4" fill="#1A1133" />
            <circle cx="27" cy="29" r="1.5" fill="#C9B8FF" />
            <circle cx="39" cy="29" r="1.5" fill="#C9B8FF" />
            <ellipse cx="32" cy="36" rx="3" ry="2" fill="#7C5CBF" />
            <path
              d="M28 40 Q32 44 36 40"
              stroke="#7C5CBF"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
            <line x1="14" y1="36" x2="26" y2="37" stroke="#7C5CBF" strokeWidth=".8" opacity=".7" />
            <line x1="14" y1="39" x2="26" y2="39" stroke="#7C5CBF" strokeWidth=".8" opacity=".7" />
            <line x1="38" y1="37" x2="50" y2="36" stroke="#7C5CBF" strokeWidth=".8" opacity=".7" />
            <line x1="38" y1="39" x2="50" y2="39" stroke="#7C5CBF" strokeWidth=".8" opacity=".7" />
          </svg>
          <span aria-hidden="true">4</span>
        </h1>

        <p className="nf-title">{t("title")}</p>
        <p className="nf-body">{t("body")}</p>

        <div className="nf-actions">
          <Link className="nf-btn nf-btn-primary" href="/">
            <Icon name="home" className="nf-btn-ic" />
            {t("backFeed")}
          </Link>
          <Link className="nf-btn nf-btn-ghost" href="/cohor">
            <Icon name="messages" className="nf-btn-ic" />
            {t("openCohor")}
          </Link>
        </div>
      </div>
    </main>
  );
}
