import type { Metadata } from "next";
import "./suspended.css";
import { SuspendedClient } from "./SuspendedClient";

/* Suspended page (route "/suspended"). Full-screen auth layout (no AppShell). The
   server component owns the metadata and imports the CSS; markup + interactivity
   live in <SuspendedClient/>: a mono countdown toward 2026-05-16, and an appeal
   submit that validates the textarea, disables controls and shows a success toast. */
export const metadata: Metadata = {
  title: "tikimiki: account suspended",
  description: "Your tikimiki account has been suspended.",
};

export default function SuspendedPage() {
  return <SuspendedClient />;
}
