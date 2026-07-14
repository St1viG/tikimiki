"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * CalendarPopup — the "Add to calendar" dropdown menu for a hackathon card.
 *
 * Rendered as a positioned dropdown (not a <dialog>) using the
 * `.hk-cal-menu` / `.hk-cal-menu-open` pattern. The parent wraps it in a
 * `.hk-cal-wrap` so CSS positioning applies correctly.
 *
 * Props:
 *   open        — controlled visibility (drives the .hk-cal-menu-open class)
 *   onClose     — callback to dismiss (called on outside click or item click)
 *   title       — event title (hackathon title)
 *   location    — optional physical/virtual location
 *   startsAt    — event start (ISO string or Date)
 *   endsAt      — event end (ISO string or Date)
 *   description — optional details line
 *   url         — optional link to the event page (path or absolute)
 *
 * The description in the created calendar event is enriched with the
 * event page link and a tikimiki footer.
 *
 * Autor: Stevan Gnjato (2023/0141)
 */

const M = {
  menuLabel: { en: "Add to calendar", sr: "Dodaj u kalendar" },
  google: { en: "Google Calendar", sr: "Google Calendar" },
  apple: { en: "Apple Calendar (.ics)", sr: "Apple Calendar (.ics)" },
  eventPage: { en: "Event page", sr: "Stranica hackathona" },
  footer: {
    en: "Added via tikimiki — the all-in-one hackathon platform",
    sr: "Dodato preko tikimiki — sve-u-jednom platforme za hackathone",
  },
} as const;

/** Details of the event the calendar links target. */
interface CalendarEvent {
  title: string;
  location?: string;
  startsAt: string | Date;
  endsAt: string | Date;
  description?: string;
  url?: string;
}

/** Format an ISO string or Date as a UTC calendar timestamp (yyyymmddThhmmssZ). */
const calStamp = (value: string | Date) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Slugify the title for the downloaded .ics filename. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "event";

/** Build a Google Calendar "add event" URL from the event details. */
function googleCalUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${calStamp(event.startsAt)}/${calStamp(event.endsAt)}`,
  });
  if (event.location) params.set("location", event.location);
  if (event.description) params.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape text for an ICS property value (RFC 5545 §3.3.11). */
const icsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Build the raw .ics file contents for the event. */
function buildIcs(event: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//tikimiki//hackathons//EN",
    "BEGIN:VEVENT",
    `UID:${slug(event.title)}@tikimiki`,
    `DTSTAMP:${calStamp(new Date())}`,
    `DTSTART:${calStamp(event.startsAt)}`,
    `DTEND:${calStamp(event.endsAt)}`,
    `SUMMARY:${icsText(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${icsText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function CalendarPopup({
  open,
  onClose,
  title,
  location,
  startsAt,
  endsAt,
  description,
  url,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  location?: string;
  startsAt: string | Date;
  endsAt: string | Date;
  description?: string;
  url?: string;
}) {
  const t = useT(M);
  const menuRef = useRef<HTMLDivElement>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const eventUrl = url ? (url.startsWith("http") ? url : `${origin}${url}`) : undefined;

  const details = [description, eventUrl && `${t("eventPage")}: ${eventUrl}`, `—\n${t("footer")}`]
    .filter(Boolean)
    .join("\n\n");

  const event: CalendarEvent = {
    title,
    location,
    startsAt,
    endsAt,
    description: details,
    url: eventUrl,
  };

  // Close when a click happens outside this menu
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open, onClose]);

  const downloadIcs = () => {
    const ics = buildIcs(event);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className={`hk-cal-menu${open ? " hk-cal-menu-open" : ""}`}
      role="menu"
      aria-label={t("menuLabel")}
    >
      <a
        className="hk-cal-item"
        role="menuitem"
        tabIndex={open ? 0 : -1}
        href={googleCalUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
      >
        <Icon name="calendar" />
        {t("google")}
      </a>
      <button
        className="hk-cal-item"
        type="button"
        role="menuitem"
        tabIndex={open ? 0 : -1}
        onClick={downloadIcs}
      >
        <Icon name="calendar" />
        {t("apple")}
      </button>
    </div>
  );
}

export default CalendarPopup;
