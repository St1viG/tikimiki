import type { Metadata } from "next";
import { UserProfileClient } from "./UserProfileClient";

export const metadata: Metadata = {
  title: "tikimiki: profil",
  description: "Korisnički profil, objave i konekcije.",
};

export default function UserProfilePage({ params }: { params: { username: string } }) {
  return <UserProfileClient username={params.username} />;
}
