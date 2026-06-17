"use client";

import Link from "next/link";
import { useT } from "@/components/i18n/LanguageProvider";
import "./auth-shell.css";

/**
 * Wordmark — the single source of truth for the "tikimiki" wordmark link that
 * the six auth pages previously rendered three different ways (.auth-wordmark
 * tilted on login, .auth-top .wordmark on signup, .auth-logo on suspended).
 *
 * The three visual treatments are preserved via the `variant` prop, which maps
 * to the page-scoped CSS class that already styles it. Default uses the shared
 * .auth-wordmark-link sizing from auth-shell.css.
 */

const M = {
  homeLabel: { en: "tikimiki: home", sr: "tikimiki: početna" },
} as const;

export type WordmarkVariant = "default" | "tilted" | "logo";

const VARIANT_CLASS: Record<WordmarkVariant, string> = {
  default: "auth-wordmark-link",
  tilted: "auth-wordmark",
  logo: "auth-logo",
};

export function Wordmark({ variant = "default" }: { variant?: WordmarkVariant }) {
  const t = useT(M);
  return (
    <Link className={VARIANT_CLASS[variant]} href="/" aria-label={t("homeLabel")}>
      <b>tiki</b>miki
    </Link>
  );
}

export default Wordmark;
