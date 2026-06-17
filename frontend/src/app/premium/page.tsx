import type { Metadata } from "next";
import "./premium.css";
import { PremiumClient } from "./PremiumClient";

/* Premium page (route "/premium"). Server component owns the page <title>; all
   interactive behaviour (billing toggle, FAQ accordion, activate button) lives in
   <PremiumClient/>, which passes variant="no-right" to AppShell and supplies its own
   <main className="premium-page">. */
export const metadata: Metadata = {
  title: "tikimiki: premium",
  description: "Upgrade your hackathon experience with tikimiki Premium.",
};

export default function PremiumPage() {
  return <PremiumClient />;
}
