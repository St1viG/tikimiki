import type { Metadata } from "next";
import { Suspense } from "react";
import "./moderator.css";
import { AppShell } from "@/components/shell/AppShell";
import { ModeratorClient } from "./ModeratorClient";

/* Moderator panel (route "/moderator"). Server component owns the page <title>; the
   interactive panel (report cards, modals, toast, chip toggles, live search) lives in
   <ModeratorClient/>. Uses variant="no-right". Reads an optional `?server=` query param
   (via useSearchParams in ModeratorClient, hence the Suspense boundary) to scope to one
   Cohor server's reports instead of the platform-wide admin view. */
export const metadata: Metadata = {
  title: "tikimiki: moderator panel",
  description: "Content reports — review and process reports for this hackathon.",
};

export default function ModeratorPage() {
  return (
    <AppShell variant="no-right">
      <Suspense fallback={null}>
        <ModeratorClient />
      </Suspense>
    </AppShell>
  );
}
