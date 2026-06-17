import type { Metadata } from "next";
import "./notifications.css";
import { NotificationsClient } from "./NotificationsClient";

/* Notifications page (route "/notifications"). Server component owns the tab <title>;
   all interactivity (tab filter, mark-read, accept/decline) lives in
   <NotificationsClient/>. Default 3-col variant with the standard <RailRight/>. */
export const metadata: Metadata = {
  title: "tikimiki: notifications",
  description: "Your notifications.",
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
