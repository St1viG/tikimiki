import type { Metadata } from "next";
import "./store.css";
import { StoreClient } from "./StoreClient";

/* Store page (route "/store"). Server component owns the <title>; all interactivity
   (filter chips, XP wallet, buy modal, toast) lives in <StoreClient/>, wrapped in
   <AppShell> with a page-specific right rail (<StoreRailRight/>). */
export const metadata: Metadata = {
  title: "tikimiki: store",
  description: "Official tikimiki merch. Pay with XP points earned at hackathons and mini-games.",
};

export default function StorePage() {
  return <StoreClient />;
}
