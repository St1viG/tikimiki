import type { Metadata } from "next";
import "@/styles/legal.css";
import { PrivacyClient } from "./PrivacyClient";

/* Privacy policy (route "/privacy"). Standalone auth-shell layout, same
   pattern as /about and /accessibility. */
export const metadata: Metadata = {
  title: "tikimiki: privacy policy",
  description: "What data tikimiki collects, how it's used, and your rights.",
};

export default function PrivacyPage() {
  return <PrivacyClient />;
}
