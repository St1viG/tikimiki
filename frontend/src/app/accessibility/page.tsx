import type { Metadata } from "next";
import "@/styles/legal.css";
import { AccessibilityClient } from "./AccessibilityClient";

/* Accessibility statement (route "/accessibility"). Standalone auth-shell
   layout, same pattern as /about. */
export const metadata: Metadata = {
  title: "tikimiki: accessibility",
  description: "tikimiki's accessibility statement and how to report issues.",
};

export default function AccessibilityPage() {
  return <AccessibilityClient />;
}
