import type { Metadata } from "next";
import { Suspense } from "react";
import "./auth.css";
import { AuthClient } from "./AuthClient";

/* Login page (route "/login"). Server component owns the page <title>; the
   interactive auth card (sign-in + registration modes) lives in <AuthClient/>,
   Suspense-wrapped because it reads search params for the OAuth return leg.
   Full-screen layout (no AppShell); the root layout provides <body>, the
   sprite, the grain overlay and the skip-link. */
export const metadata: Metadata = {
  title: "tikimiki: sign in",
  description: "Sign in to your tikimiki account.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthClient initialMode="login" />
    </Suspense>
  );
}
