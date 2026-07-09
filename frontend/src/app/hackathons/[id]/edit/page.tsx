import type { Metadata } from "next";
import "../../new/new-hackathon.css";
import { NewHackathonClient } from "../../new/NewHackathonClient";

/**
 * Edit-hackathon page (route "/hackathons/[id]/edit") — organizer (owner) only;
 * the backend enforces ownership on PATCH. Reuses the create form in edit mode:
 * it loads the hackathon + its application questions, then saves field changes
 * and reconciles the question set on submit.
 */
export const metadata: Metadata = {
  title: "tikimiki: edit hackathon",
  description: "Update your hackathon.",
};

export default function EditHackathonPage({ params }: { params: { id: string } }) {
  return <NewHackathonClient hackathonId={params.id} />;
}
