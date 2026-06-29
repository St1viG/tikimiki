import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "./notifications.css";
import { NotificationsClient } from "./NotificationsClient";

/* Demo notifications page (route "/demo/notifications"). Server component owns the
   tab <title>; interactivity lives in <NotificationsClient/>, which renders
   <NotificationPopup/>. Uses AppShell variant="no-right". */
export const metadata: Metadata = {
  title: "tikimiki: notifications (popup)",
  description: "Notification popup component demo.",
};

export default function DemoNotificationsPage() {
  // Dev-only test harness: hide it from users in production (still works in dev).
  if (process.env.NODE_ENV === "production") notFound();
  return <NotificationsClient />;
}
