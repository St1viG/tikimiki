import type { Metadata } from "next";
import { Suspense } from "react";
import "./login.css";
import { LoginClient } from "./LoginClient";

/* Login page (route "/login"). Server component owns the page <title>; the
   interactive content (password toggle, captcha flash) lives in <LoginClient/>.
   Full-screen layout (no AppShell); the root layout provides <body>, the sprite,
   the grain overlay and the skip-link. */
export const metadata: Metadata = {
  title: "tikimiki: sign in",
  description: "Sign in to your tikimiki account.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
