import type { Metadata } from "next";
import { Suspense } from "react";
import "./admin.css";
import { AdminClient } from "./AdminClient";

/* Admin panel (route "/admin"). Server component owns the page <title>; all markup,
   section tabs, confirmation modals, toast and the appeal/profile popups live in
   <AdminClient/>, which renders inside <AppShell variant="no-right">. Page-specific
   styles are in ./admin.css. Reads an optional `?tab=` query param (via useSearchParams
   in AdminClient, hence the Suspense boundary) to deep-link into a specific section —
   e.g. /moderator's back link returns to `?tab=prijave`. */
export const metadata: Metadata = {
  title: "tikimiki: admin panel",
  description: "Platform oversight, content reports and account management.",
};

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminClient />
    </Suspense>
  );
}
