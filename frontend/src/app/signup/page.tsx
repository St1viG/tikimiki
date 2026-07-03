import type { Metadata } from "next";
import { Suspense } from "react";
import "../login/auth.css";
import { AuthClient } from "../login/AuthClient";

/* Signup route ("/signup"). Same shared <AuthClient/> card as /login, opened
   in register mode; switching modes swaps the URL in place. Server component
   owns the <title>. */
export const metadata: Metadata = {
  title: "tikimiki: sign up",
  description: "Create your tikimiki account.",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthClient initialMode="register" />
    </Suspense>
  );
}
