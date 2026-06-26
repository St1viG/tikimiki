import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Sprite } from "@/components/Sprite";
import { ThemeProvider, themeInitScript } from "@/components/theme/ThemeProvider";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { localeInitScript } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "tikimiki",
  description:
    "tikimiki — a gamified platform for student hackathons: discovery, applications, teams, competition and rewards.",
};

/**
 * Root layout — renders the document shell every page shares.
 *
 * - <html lang="en"> (default; set per saved locale by an inline script) with the
 *   Google Fonts links for Bricolage Grotesque and Space Grotesk. JetBrains Mono is
 *   @import-ed by globals.css, so it is not linked here.
 * - <body> renders, in order: the global skip-link, the icon <Sprite/>, the
 *   grain overlay, then the page {children}.
 *
 * Pages must NOT output <html>/<head>/<body>, the sprite, the grain div, or the
 * skip-link — they are all provided here once.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme + language before paint (no flash). Runs
            before React hydrates <html>. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: localeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <a className="skip-link" href="#feed">
                Skip to content
              </a>
              <Sprite />
              <div className="grain" aria-hidden="true" />
              {children}
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
