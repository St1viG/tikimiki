"use client";

import Link from "next/link";
import { useT } from "@/components/i18n/LanguageProvider";
import "./auth-shell.css";

/**
 * AuthFooter — the About / Help / Privacy · © tikimiki footer repeated across
 * the auth pages. The footer keys live here (moved out of each page's M) so the
 * copy is defined once.
 *
 * Two structural variants preserve the existing per-page markup so the page CSS
 * keeps applying:
 *   - "links"  → login / signup / org-signup (.auth-footer-links + .auth-footer-copy)
 *   - "inline" → suspended (flat "·"-separated list + .cw copyright)
 */

const M = {
  aboutUs: { en: "About us", sr: "O nama" },
  help: { en: "Help", sr: "Pomoć" },
  terms: { en: "Terms", sr: "Uslovi" },
  helpCenter: { en: "Help center", sr: "Centar za pomoć" },
  platformRules: { en: "Platform rules", sr: "Pravila platforme" },
  privacy: { en: "Privacy", sr: "Privatnost" },
} as const;

export function AuthFooter({ variant = "links" }: { variant?: "links" | "inline" }) {
  const t = useT(M);

  if (variant === "inline") {
    return (
      <footer className="auth-footer">
        <Link href="/help">{t("helpCenter")}</Link> ·{" "}
        <Link href="/terms">{t("platformRules")}</Link> ·{" "}
        <Link href="/privacy">{t("privacy")}</Link>
        <br />
        <span className="cw">
          <b>tiki</b>miki
        </span>{" "}
        © 2026
      </footer>
    );
  }

  return (
    <footer className="auth-footer">
      <div className="auth-footer-links">
        <Link href="/about">{t("aboutUs")}</Link> <span>·</span>
        <Link href="/help">{t("help")}</Link> <span>·</span>
        <Link href="/privacy">{t("privacy")}</Link> <span>·</span>
        <Link href="/terms">{t("terms")}</Link>
      </div>
      <div className="auth-footer-copy">
        <b>tiki</b>miki &copy; <span className="yr">2026</span>
      </div>
    </footer>
  );
}

export default AuthFooter;
