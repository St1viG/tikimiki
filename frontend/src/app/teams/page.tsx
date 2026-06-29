import type { Metadata } from "next";
import "./teams.css";
import { TeamsClient } from "./TeamsClient";

/* Teams page (route "/teams"). Server component owns the page <title>; all interactive
   behaviour (tab filter + popup modals) lives in <TeamsClient/>. AppShell + RailRight
   are rendered inside TeamsClient (default 3-col variant). */
export const metadata: Metadata = {
  title: "tikimiki: teams",
  description: "Find teammates and manage your hackathon teams.",
};

export default function TeamsPage() {
  return <TeamsClient />;
}
