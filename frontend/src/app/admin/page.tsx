import type { Metadata } from "next";
import "./admin.css";
import { AdminClient } from "./AdminClient";

/* Admin panel (route "/admin"). Server component owns the page <title>; all markup,
   section tabs, confirmation modals, toast and the appeal/profile popups live in
   <AdminClient/>, which renders inside <AppShell variant="no-right">. Page-specific
   styles are in ./admin.css. */
export const metadata: Metadata = {
  title: "tikimiki: admin panel",
  description: "Platform oversight, content reports and account management.",
};

export default function AdminPage() {
  return <AdminClient />;
}
