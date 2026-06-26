import type { Metadata } from "next";
import "./home.css";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { FeedClient } from "./FeedClient";

/* Home feed (route "/"). Server component owns the page <title>; the interactive feed
   (tab filter + like toggles) lives in <FeedClient/>, wrapped in <AppShell> (default
   3-col) with the default <RailRight/>. */
export const metadata: Metadata = {
  title: "tikimiki: feed",
  description: "Your community feed — hackathons, updates, and posts.",
};

export default function HomePage() {
  return (
    <AppShell right={<RailRight />}>
      <FeedClient />
    </AppShell>
  );
}
