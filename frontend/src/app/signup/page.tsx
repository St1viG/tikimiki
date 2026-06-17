import type { Metadata } from "next";
import "./signup.css";
import { SignupClient } from "./SignupClient";

/* Signup route ("/signup"). Full-screen auth layout (no AppShell). Server component
   owns the page <title>; all interactivity (password-strength bars, reveal toggles,
   captcha checkbox, terms validation) lives in <SignupClient/>. */
export const metadata: Metadata = {
  title: "tikimiki: sign up",
  description: "Create your tikimiki account.",
};

export default function SignupPage() {
  return <SignupClient />;
}
