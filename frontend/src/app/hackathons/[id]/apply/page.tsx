import type { Metadata } from "next";
import "./apply-hackathon.css";
import { ApplyHackathonClient } from "./ApplyHackathonClient";

/**
 * Apply-to-a-hackathon page (route "/hackathons/[id]/apply").
 *
 * Server component: owns the page <title>. The co-located client component
 * <ApplyHackathonClient/> renders the hackathon header, team selection (if the
 * hackathon supports teams), the organizer's custom application questions, and
 * submits via POST /applications. Linked from the hackathons listing's Apply CTA.
 */
export const metadata: Metadata = {
  title: "tikimiki: apply to a hackathon",
  description: "Submit your application to a hackathon.",
};

export default function ApplyHackathonPage({ params }: { params: { id: string } }) {
  return <ApplyHackathonClient hackathonId={params.id} />;
}
