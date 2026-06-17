import type { Metadata } from "next";
import "./signup-organization.css";
import { SignupOrganizationClient } from "./SignupOrganizationClient";

/* Org signup route ("/signup/organization"). Full-screen page (no AppShell). Server
   component owns the <title>; markup + interactivity live in
   <SignupOrganizationClient/>: per-field password reveal, password-strength bars,
   live confirm-password match, captcha checkbox, and terms validation on submit. */
export const metadata: Metadata = {
  title: "tikimiki: organization sign up",
  description: "Register your organization on tikimiki.",
};

export default function SignupOrganizationPage() {
  return <SignupOrganizationClient />;
}
