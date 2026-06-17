import type { ReactNode } from "react";
import "@/styles/cohor.css";

/* /cohor layout — full-screen Discord-style chat app. Does not use AppShell; the
   full-viewport .cohor-app root depends on cohor.css (its own design system),
   imported here so it applies only to this route subtree. The root layout already
   provides <html>/<body>, the icon sprite, the grain overlay and the skip-link. */
export default function CohorLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
