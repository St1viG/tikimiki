import type { Metadata } from "next";
import { Suspense } from "react";
import "./teams.css";
import { AppShell } from "@/components/shell/AppShell";
import { TeamsClient } from "./TeamsClient";

/* Organizer team-progress overview (route "/hackathons/teams"). Reuses the
   `?hackathonId=` picker convention from /applications; all markup + state
   live in <TeamsClient/>. */
export const metadata: Metadata = {
  title: "tikimiki: teams",
  description: "Track team progress across your hackathon.",
};

export default function TeamsPage() {
  // Suspense boundary required because TeamsClient reads useSearchParams().
  return (
    <AppShell variant="no-right">
      <Suspense>
        <TeamsClient />
      </Suspense>
    </AppShell>
  );
}
