import type { Metadata } from "next";
import "@/styles/legal.css";
import { HelpClient } from "./HelpClient";

/* Help Center (route "/help"). Standalone auth-shell layout, same pattern as
   /about, /accessibility, /privacy and /terms. */
export const metadata: Metadata = {
  title: "tikimiki: help center",
  description: "Answers to common questions about using tikimiki.",
};

export default function HelpPage() {
  return <HelpClient />;
}
