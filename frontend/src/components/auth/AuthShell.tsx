"use client";

import type { ReactNode } from "react";
import { Wordmark, type WordmarkVariant } from "./Wordmark";
import { AuthFooter } from "./AuthFooter";
import "./auth-shell.css";

/**
 * AuthShell — the shared chrome every auth page repeated: the `.auth-page`
 * wrapper, the tikimiki <Wordmark/>, the page body, and the <AuthFooter/>.
 *
 * The page-specific bits stay configurable so each route keeps its own CSS:
 *   - `wordmarkVariant` selects which wordmark treatment (tilted / logo / default)
 *   - `wrapWordmark` puts the wordmark inside `.auth-top` (signup pages)
 *   - `footerVariant` selects the footer markup ("links" vs suspended "inline")
 *   - `as` picks the root element ("div" for most, "main" for suspended)
 *
 * Children render between the wordmark and footer (typically an `.auth-card`
 * or `.susp-card`).
 */
export function AuthShell({
  children,
  wordmarkVariant = "default",
  wrapWordmark = false,
  footerVariant = "links",
  as = "div",
}: {
  children: ReactNode;
  wordmarkVariant?: WordmarkVariant;
  wrapWordmark?: boolean;
  footerVariant?: "links" | "inline";
  as?: "div" | "main";
}) {
  const Root = as;
  return (
    <Root className="auth-page">
      {wrapWordmark ? (
        <div className="auth-top">
          <Wordmark variant={wordmarkVariant} />
        </div>
      ) : (
        <Wordmark variant={wordmarkVariant} />
      )}

      {children}

      <AuthFooter variant={footerVariant} />
    </Root>
  );
}

export default AuthShell;
