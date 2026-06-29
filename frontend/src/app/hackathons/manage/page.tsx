import type { Metadata } from "next";
import "./manage.css";
import { ManageClient } from "./ManageClient";

/* Hackathons manage page (route "/hackathons/manage"). Server component owns the page
   <title>; all interactive behaviour (tab filter, chip toggles, search, join/load-more,
   create-hackathon popup, calendar dropdown) lives in <ManageClient/>. Uses
   variant="no-right". */
export const metadata: Metadata = {
  title: "tikimiki: manage hackathons",
  description: "Manage your hackathons and track participant statistics.",
};

export default function HackathonsManagePage() {
  return <ManageClient />;
}
