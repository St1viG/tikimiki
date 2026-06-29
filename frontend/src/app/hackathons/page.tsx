import type { Metadata } from "next";
import "./hackathons.css";
import { HackathonsClient } from "./HackathonsClient";

/* Hackathons page (route "/hackathons"). Server component owns the page <title>; all
   interactivity (tab filter, chip toggles, search, sort) lives in <HackathonsClient/>,
   which renders every section from live data. */
export const metadata: Metadata = {
  title: "tikimiki: hackathons",
  description: "Find and apply to upcoming hackathons.",
};

export default function HackathonsPage() {
  return <HackathonsClient />;
}
