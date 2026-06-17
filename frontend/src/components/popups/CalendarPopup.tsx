"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * CalendarPopup — the "Add to calendar" dropdown menu for the featured
 * hackathon card.
 *
 * Rendered as a positioned dropdown (not a <dialog>) using the
 * `.hk-cal-menu` / `.hk-cal-menu-open` pattern. The parent wraps it in a
 * `.hk-cal-wrap` so CSS positioning applies correctly.
 *
 * Props:
 *   open    — controlled visibility (drives the .hk-cal-menu-open class)
 *   onClose — callback to dismiss (called on outside click or item click)
 */

const M = {
  menuLabel: { en: "Add to calendar", sr: "Dodaj u kalendar" },
  google:    { en: "Google Calendar", sr: "Google Calendar" },
  apple:     { en: "Apple Calendar (.ics)", sr: "Apple Calendar (.ics)" },
} as const;

/**
 * The featured hackathon shown alongside this menu is static demo content, so
 * the calendar links target that fixed event. When this becomes data-driven,
 * pass the real title/dates in as props.
 */
const EVENT = {
  title: "ETF HackWeek 2026",
  location: "Beograd, ETF",
  startsAt: "2026-04-20T09:00:00",
  endsAt: "2026-04-22T09:00:00",
};

const calStamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function googleCalUrl(): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: EVENT.title,
    location: EVENT.location,
    dates: `${calStamp(EVENT.startsAt)}/${calStamp(EVENT.endsAt)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function CalendarPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT(M);
  const menuRef = useRef<HTMLDivElement>(null);

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
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//tikimiki//hackathons//EN",
      "BEGIN:VEVENT",
      `UID:${EVENT.title.replace(/\s+/g, "-")}@tikimiki`,
      `DTSTAMP:${calStamp(new Date().toISOString())}`,
      `DTSTART:${calStamp(EVENT.startsAt)}`,
      `DTEND:${calStamp(EVENT.endsAt)}`,
      `SUMMARY:${EVENT.title}`,
      `LOCATION:${EVENT.location}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "etf-hackweek-2026.ics";
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
        href={googleCalUrl()}
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
