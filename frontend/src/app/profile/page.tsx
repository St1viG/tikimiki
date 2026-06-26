import type { Metadata } from "next";
import "./profile.css";
import { ProfileClient } from "./ProfileClient";

/**
 * Profile route ("/profile") — canonical redirect entry point.
 *
 * The real profile lives at "/u/<username>"; this route resolves the session
 * client-side and forwards there (or to /login when signed out). Server
 * component: owns the page <title> via `metadata` and imports the co-located
 * profile.css. Redirect + loading state live in the "use client" child
 * <ProfileClient/>.
 */
export const metadata: Metadata = {
  title: "tikimiki: profile",
  description: "User profile.",
};

export default function ProfilePage() {
  return <ProfileClient />;
}
