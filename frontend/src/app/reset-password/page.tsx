import type { Metadata } from "next";
import { Suspense } from "react";
import "../login/login.css";
import { ResetPasswordClient } from "./ResetPasswordClient";

/**
 * Password reset page (route "/reset-password").
 *
 * Server component: owns the page <title> via `metadata`. The interactive
 * content (reads ?token, collects a new password) lives in the co-located
 * client component <ResetPasswordClient/>, Suspense-wrapped because it reads
 * search params. Reuses the auth layout styles from login.css.
 */
export const metadata: Metadata = {
  title: "tikimiki: reset password",
  description: "Choose a new password for your tikimiki account.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordClient />
    </Suspense>
  );
}
