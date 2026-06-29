import type { Metadata } from "next";
import { Suspense } from "react";
import "./cohor-page.css";
import { CohorClient } from "./CohorClient";

/* Cohor (route "/cohor") — full Discord-style chat app. Server component owns the
   page <title>; the interactive chat lives in <CohorClient/>. Full-screen route
   (no AppShell); layout.tsx imports @/styles/cohor.css, plus the co-located
   cohor-page.css above. */
export const metadata: Metadata = {
  title: "tikimiki: Cohor",
  description: "Discord-style chat for hackathon teams: channels, DMs, bounties, audience voting, kanban, and results.",
};

export default function CohorPage() {
  return (
    <Suspense fallback={null}>
      <CohorClient />
    </Suspense>
  );
}
