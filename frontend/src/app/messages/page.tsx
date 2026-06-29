import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesClient } from "./MessagesClient";

export const metadata: Metadata = {
  title: "tikimiki: messages",
  description: "Direct messages.",
};

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesClient />
    </Suspense>
  );
}
