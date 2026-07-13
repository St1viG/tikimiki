import type { Metadata } from "next";
import "@/styles/legal.css";
import { AboutClient } from "./AboutClient";

/* About page (route "/about"). Standalone auth-shell layout (no AppShell) so it
   reads the same logged-in or logged-out. Server component owns the metadata
   and imports the shared legal-page CSS; markup lives in <AboutClient/>. */
export const metadata: Metadata = {
  title: "tikimiki: about",
  description: "What tikimiki is, and who it's built for.",
};

export default function AboutPage() {
  return <AboutClient />;
}
