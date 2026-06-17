import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "./avatars.css";
import { AvatarsClient } from "./AvatarsClient";

/**
 * /demo/avatars — generative-avatar comparison gallery.
 *
 * Server component: owns the page <title> via `metadata` and imports the
 * co-located avatars.css. The live, stateful gallery lives in the "use client"
 * child <AvatarsClient/>.
 */
export const metadata: Metadata = {
  title: "tikimiki: avatars (demo)",
  description: "Generative avatar gallery demo.",
};

export default function AvatarsGalleryPage() {
  // Dev-only test harness: hide it from users in production (still works in dev).
  if (process.env.NODE_ENV === "production") notFound();
  return <AvatarsClient />;
}
