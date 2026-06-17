import type { Metadata } from "next";
import "./find.css";
import { FindClient } from "./FindClient";

/* /teams/find — "Pronadji tim" page. Server component owns the page <title>; the
   interactive content (tab filter + popup modals) lives in <FindClient/>. AppShell
   and RailRight are instantiated inside FindClient (default 3-col variant) so the
   "use client" boundary owns the layout and popup state. */
export const metadata: Metadata = {
  title: "tikimiki: find a team",
  description: "Find an open team or accept an invite for the next hackathon.",
};

export default function TeamsFindPage() {
  return <FindClient />;
}
