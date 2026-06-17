import type { Metadata } from "next";
import { Suspense } from "react";
import "../login/login.css";
import { VerifyEmailClient } from "./VerifyEmailClient";

/**
 * Email verification page (route "/verify-email").
 *
 * Server component: owns the page <title> via `metadata`. The interactive
 * content (reads ?token and confirms it) lives in the co-located client
 * component <VerifyEmailClient/>, Suspense-wrapped because it reads search
 * params. Reuses the auth layout styles from login.css.
 */
export const metadata: Metadata = {
  title: "tikimiki: verify email",
  description: "Confirm your tikimiki email address.",
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailClient />
    </Suspense>
  );
}
