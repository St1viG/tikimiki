import type { Metadata } from "next";
import "./applications.css";
import { AppShell } from "@/components/shell/AppShell";
import { ApplicationsClient } from "./ApplicationsClient";

/* Applications admin (route "/applications"). Server component owns the page <title>;
   all markup + state (status tabs, skill filters, candidate popup, reject modal,
   live stats, toast) live in <ApplicationsClient/>. This page has a page-specific
   right rail rendered by the client as a sibling of <main>, so we pass an empty
   `right` to AppShell to suppress the default <RailRight/>. */
export const metadata: Metadata = {
  title: "tikimiki: applications",
  description: "Review, approve and reject hackathon applications.",
};

export default function ApplicationsPage() {
  return (
    <AppShell right={<></>}>
      <ApplicationsClient />
    </AppShell>
  );
}
