import type { Metadata } from "next";
import "./leaderboard.css";
import { AppShell } from "@/components/shell/AppShell";
import { LeaderboardClient } from "./LeaderboardClient";

/* Leaderboard page (route "/leaderboard"). Server component owns the page <title>;
   the interactive content (period tabs + hackathon filter) lives in
   <LeaderboardClient/>. Uses variant="no-right" (no right rail). */
export const metadata: Metadata = {
  title: "tikimiki: leaderboard",
  description: "Members ranked by total points earned at hackathons.",
};

export default function LeaderboardPage() {
  return (
    <AppShell variant="no-right">
      <LeaderboardClient />
    </AppShell>
  );
}
