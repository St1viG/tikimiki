import type { Metadata } from "next";
import "./gamehub.css";
import { GamehubClient } from "./GamehubClient";

/**
 * GameHub (route "/gamehub") — the daily-games hub.
 *
 * Redesigned as a NYT-Games / LinkedIn-Games style hub: several daily games as
 * cards, an overall + per-game streak system, and friend comparison (per-card
 * + a right-rail "Prijatelji danas" panel). Each game lives behind its card and
 * opens as a self-contained modal (see src/components/gamehub/registry.tsx;
 * real games land in Phase 3).
 *
 * Server component: owns the page <title> via `metadata` and imports the
 * co-located page CSS. All interactivity (open-game state, the streak band, the
 * cards and modals) lives in the "use client" child <GamehubClient/>, which
 * supplies the AppShell (with the FriendsPanel right rail) and the page <main>.
 */
export const metadata: Metadata = {
  title: "tikimiki: GameHub",
  description: "Daily games, streaks and a duel with friends.",
};

export default function GamehubPage() {
  return <GamehubClient />;
}
