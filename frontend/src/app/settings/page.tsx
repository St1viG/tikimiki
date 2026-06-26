import type { Metadata } from "next";
import "./settings.css";
import { SettingsClient } from "./SettingsClient";

/* Settings (route "/settings"). Server component owns the page <title>; all markup,
   the tabbed sub-nav, live profile-preview right rail, character counters, toggles,
   skills editor, color picker, save-status pops, danger zone and Premium billing
   live in <SettingsClient/>. Because the right rail shares state with the main form,
   <SettingsClient/> renders <AppShell> itself, passing both the <main> and the
   profile-preview <aside> (the `right` prop). */
export const metadata: Metadata = {
  title: "tikimiki: settings",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
