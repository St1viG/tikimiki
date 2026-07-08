import type { Metadata } from "next";
import "./new-hackathon.css";
import { NewHackathonClient } from "./NewHackathonClient";

/**
 * Create-hackathon page (route "/hackathons/new") — organizations only.
 *
 * Server component: owns the page <title> via `metadata`. The co-located
 * client component <NewHackathonClient/> renders the creation form (or an
 * "organization accounts only" state for everyone else) and submits via
 * POST /api/v1/hackathons.
 */
export const metadata: Metadata = {
  title: "tikimiki: organize a hackathon",
  description: "Create and publish a new hackathon.",
};

export default function NewHackathonPage({
  searchParams,
}: {
  searchParams: { draft?: string };
}) {
  return <NewHackathonClient resumeDraftId={searchParams.draft} />;
}
