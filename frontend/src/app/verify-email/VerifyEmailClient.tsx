"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/components/i18n/LanguageProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { ApiError, confirmEmailVerification } from "@/lib/api";

/**
 * VerifyEmailClient — confirms an email-verification token.
 *
 * Reads ?token from the URL and POSTs it on mount. Shows a verifying state,
 * then success or error. Minimal centered layout reusing the auth-card styles
 * from login.css (imported by the server page component).
 */

const M = {
  heading: { en: "Verify your email", sr: "Potvrdi svoj email" },
  verifying: { en: "Verifying your email…", sr: "Potvrđivanje emaila…" },
  success: { en: "Email verified", sr: "Email je potvrđen" },
  successBody: {
    en: "Your email address is now confirmed. You're all set.",
    sr: "Tvoja email adresa je potvrđena. Sve je spremno.",
  },
  missingToken: {
    en: "This verification link is missing its token.",
    sr: "Ovom linku za potvrdu nedostaje token.",
  },
  invalidToken: {
    en: "This verification link is invalid or has expired.",
    sr: "Ovaj link za potvrdu je nevažeći ili je istekao.",
  },
  genericError: {
    en: "Could not verify your email. Try again.",
    sr: "Potvrda emaila nije uspela. Pokušaj ponovo.",
  },
  goToLogin: { en: "Continue to sign in", sr: "Nastavi na prijavu" },
} as const;

type Status = "verifying" | "success" | "error";

export function VerifyEmailClient() {
  const t = useT(M);
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = searchParams?.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg(t("missingToken"));
      return;
    }

    (async () => {
      try {
        await confirmEmailVerification(token);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMsg(
          err instanceof ApiError &&
            (err.status === 400 || err.status === 404 || err.status === 410)
            ? t("invalidToken")
            : t("genericError"),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <AuthShell wordmarkVariant="tilted">
      <main className="auth-card">
        <h1 className="auth-heading">{t("heading")}</h1>

        {status === "verifying" && (
          <p role="status" style={{ fontSize: "0.9rem", opacity: 0.85 }}>
            {t("verifying")}
          </p>
        )}

        {status === "success" && (
          <div role="status">
            <p className="auth-success">{t("success")}</p>
            <p style={{ fontSize: "0.9rem", opacity: 0.85, marginBottom: "1.1rem" }}>
              {t("successBody")}
            </p>
            <Link href="/login" className="btn btn-primary btn-block">
              {t("goToLogin")}
            </Link>
          </div>
        )}

        {status === "error" && (
          <div role="alert">
            <p className="auth-error" style={{ fontSize: "0.9rem", marginBottom: "1.1rem" }}>
              {errorMsg}
            </p>
            <Link href="/login" className="btn btn-primary btn-block">
              {t("goToLogin")}
            </Link>
          </div>
        )}
      </main>
    </AuthShell>
  );
}

export default VerifyEmailClient;
