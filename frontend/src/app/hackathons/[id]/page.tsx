import type { Metadata } from "next";
import "./hackathon-detail.css";
import { HackathonDetailClient } from "./HackathonDetailClient";

/**
 * Hackathon detail page (route "/hackathons/[id]").
 *
 * Server component: owns the page <title>. The co-located client component
 * <HackathonDetailClient/> renders the full hackathon profile — banner, organizer,
 * description, schedule/meta, geographic location on an embedded Google Map, and
 * the apply call-to-action. Linked from the hackathons listing cards.
 */
export const metadata: Metadata = {
  title: "tikimiki: hackathon",
  description: "Hackathon details, schedule, and location.",
};

export default function HackathonDetailPage({ params }: { params: { id: string } }) {
  return <HackathonDetailClient hackathonId={params.id} />;
}
