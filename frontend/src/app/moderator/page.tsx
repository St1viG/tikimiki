import type { Metadata } from "next";
import "./moderator.css";
import { AppShell } from "@/components/shell/AppShell";
import { ModeratorClient } from "./ModeratorClient";

/* Moderator panel (route "/moderator"). Server component owns the page <title>; the
   interactive panel (report cards, modals, toast, chip toggles, live search) lives in
   <ModeratorClient/>. Uses variant="no-right". */
export const metadata: Metadata = {
  title: "tikimiki: moderator panel",
  description: "Content reports — review and process reports for this hackathon.",
};

export default function ModeratorPage() {
  return (
    <AppShell variant="no-right">
      <ModeratorClient />
    </AppShell>
  );
}
