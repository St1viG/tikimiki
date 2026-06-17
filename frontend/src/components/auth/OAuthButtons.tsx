"use client";

import { useT } from "@/components/i18n/LanguageProvider";
import { oauthUrl } from "@/lib/api";

/**
 * OAuthButtons — the Google + GitHub brand-SVG sign-in buttons.
 *
 * LinkedIn was dead on every auth page (no provider is wired in api.ts —
 * oauthUrl only supports "github" | "google"), so it has been removed entirely
 * rather than left as a non-functional control.
 *
 * Both providers navigate to the backend OAuth entrypoint, the same flow
 * LoginClient already used (window.location.href = oauthUrl(provider)).
 *
 * Two visual variants preserve each page's existing CSS:
 *   - "stacked" → login (.google-btn / .github-btn, full-width with labels)
 *   - "row"     → signup / org-signup (.auth-oauth-row > .auth-oauth-btn)
 */

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="currentColor" d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
  </svg>
);

const M = {
  continueWithGoogle: { en: "Continue with Google", sr: "Nastavi sa Google" },
  continueWithGithub: { en: "Continue with GitHub", sr: "Nastavi sa GitHub" },
} as const;

const startOauth = (provider: "github" | "google") => {
  window.location.href = oauthUrl(provider);
};

export function OAuthButtons({ variant = "row" }: { variant?: "stacked" | "row" }) {
  const t = useT(M);

  if (variant === "stacked") {
    return (
      <>
        <button className="google-btn" type="button" onClick={() => startOauth("google")}>
          <GoogleIcon />
          {t("continueWithGoogle")}
        </button>
        <button className="github-btn" type="button" onClick={() => startOauth("github")}>
          <GithubIcon />
          {t("continueWithGithub")}
        </button>
      </>
    );
  }

  return (
    <div className="auth-oauth-row">
      <button
        className="auth-oauth-btn"
        type="button"
        title={t("continueWithGoogle")}
        aria-label={t("continueWithGoogle")}
        onClick={() => startOauth("google")}
      >
        <GoogleIcon />
        <span className="auth-oauth-label">{t("continueWithGoogle")}</span>
      </button>
      <button
        className="auth-oauth-btn"
        type="button"
        title={t("continueWithGithub")}
        aria-label={t("continueWithGithub")}
        onClick={() => startOauth("github")}
      >
        <GithubIcon />
        <span className="auth-oauth-label">{t("continueWithGithub")}</span>
      </button>
    </div>
  );
}

export default OAuthButtons;
