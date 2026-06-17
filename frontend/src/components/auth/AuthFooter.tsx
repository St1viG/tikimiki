"use client";

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
  aboutUs:        { en: "About us",         sr: "O nama" },
  help:           { en: "Help",             sr: "Pomoć" },
  privacyAndTerms:{ en: "Privacy & terms",  sr: "Privatnost i uslovi" },
  helpCenter:     { en: "Help center",      sr: "Centar za pomoć" },
  platformRules:  { en: "Platform rules",   sr: "Pravila platforme" },
  privacy:        { en: "Privacy",          sr: "Privatnost" },
} as const;

export function AuthFooter({ variant = "links" }: { variant?: "links" | "inline" }) {
  const t = useT(M);

  if (variant === "inline") {
    return (
      <footer className="auth-footer">
        <a href="#">{t("helpCenter")}</a> · <a href="#">{t("platformRules")}</a> ·{" "}
        <a href="#">{t("privacy")}</a>
        <br />
        <span className="cw"><b>tiki</b>miki</span> © 2026
      </footer>
    );
  }

  return (
    <footer className="auth-footer">
      <div className="auth-footer-links">
        <a href="#">{t("aboutUs")}</a> <span>·</span>
        <a href="#">{t("help")}</a> <span>·</span>
        <a href="#">{t("privacyAndTerms")}</a>
      </div>
      <div className="auth-footer-copy"><b>tiki</b>miki &copy; <span className="yr">2026</span></div>
    </footer>
  );
}

export default AuthFooter;
