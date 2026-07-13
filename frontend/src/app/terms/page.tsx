import type { Metadata } from "next";
import "@/styles/legal.css";
import { TermsClient } from "./TermsClient";

/* Terms of Service (route "/terms"). Standalone auth-shell layout, same
   pattern as /about, /accessibility and /privacy. */
export const metadata: Metadata = {
  title: "tikimiki: terms of service",
  description: "The rules for using tikimiki, as a participant or an organizer.",
};

export default function TermsPage() {
  return <TermsClient />;
}
