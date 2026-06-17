"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import "./NotificationPopup.css";

/**
 * NotificationPopup — re-usable bell + notification dropdown.
 *
 * Behaviour:
 *  - .bell-btn with badge opens/closes the dropdown.
 *  - Panel animates in (dropdown-in) and out (closing → dropdown-out → hidden).
 *  - Individual rows can be marked read (removes .unread + .notif-unread-dot).
 *  - "Mark all" marks all rows as read.
 *  - Badge count reflects unread count; scales to 0 when panel is open.
 *  - Closes on outside click or Escape key.
 *
 * Props: none — self-contained with its own state.
 *
 * Usage:
 *   <NotificationPopup />
 */

const M = {
  bellLabel:      { en: "Notifications",                  sr: "Notifikacije" },
  unreadBadge:    { en: "unread",                         sr: "nepročitane" },
  dropdownLabel:  { en: "Notifications",                  sr: "Notifikacije" },
  dropdownTitle:  { en: "Notifications",                  sr: "Notifikacije" },
  markAll:        { en: "Mark all",                       sr: "Označi sve" },
  seeAll:         { en: "See all notifications",          sr: "Pogledaj sve notifikacije" },
} as const;

interface NotifItem {
  id: string;
  avatarInitials: string;
  avatarClass: string;
  avatarSeed?: string;
  sender: string;
  text: string;
  time: string;
  unread: boolean;
}

const INITIAL_NOTIFS: NotifItem[] = [
  {
    id: "n1",
    avatarInitials: "SG",
    avatarClass: "v",
    avatarSeed: "stivig",
    sender: "StiviG",
    text: "au koji buzz 🔥",
    time: "pre 3 minuta",
    unread: true,
  },
  {
    id: "n2",
    avatarInitials: "PŠ",
    avatarClass: "t",
    avatarSeed: "pesic",
    sender: "pesic",
    text: "ja nekako... 😅",
    time: "pre 11 minuta",
    unread: true,
  },
  {
    id: "n3",
    avatarInitials: "NK",
    avatarClass: "v",
    avatarSeed: "nenad1337",
    sender: "nenad1337",
    text: "ja u kohoru 🚀",
    time: "pre 28 minuta",
    unread: true,
  },
  {
    id: "n4",
    avatarInitials: "HW",
    avatarClass: "org-l",
    sender: "ETF HackWeek",
    text: "Prijave su otvorene! Prijavi se do 20. aprila.",
    time: "pre 2 sata",
    unread: false,
  },
  {
    id: "n5",
    avatarInitials: "TM",
    avatarClass: "org-b",
    sender: "tikimiki",
    text: "Dobrodošao! Popuni profil i osvoji bedž. 🏅",
    time: "juče",
    unread: false,
  },
];

export function NotificationPopup() {
  const t = useT(M);
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>(INITIAL_NOTIFS);
  const anchorRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifs.filter((n) => n.unread).length;

  const openNotif = () => {
    setClosing(false);
    setIsOpen(true);
  };

  const closeNotif = () => {
    setClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setClosing(false);
    }, 140);
  };

  const toggleNotif = (e: React.MouseEvent) => {
    e.stopPropagation();
    isOpen ? closeNotif() : openNotif();
  };

  const markRead = (id: string) =>
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
    );

  const markAllRead = () =>
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        closeNotif();
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNotif();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  return (
    <div className="bell-anchor notif-anchor" ref={anchorRef}>
      <button
        className={`bell-btn${isOpen ? " bell-active" : ""}`}
        id="bell-btn"
        onClick={toggleNotif}
        aria-label={t("bellLabel")}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Icon name="bell" />
        <span
          className="bell-badge"
          id="bell-badge"
          aria-label={`${unreadCount} ${t("unreadBadge")}`}
          style={unreadCount === 0 ? { transform: "scale(0)" } : undefined}
        >
          {unreadCount}
        </span>
      </button>

      {isOpen && (
        <div
          className={`notif-dropdown${closing ? " closing" : ""}`}
          id="notif-dropdown"
          role="menu"
          aria-label={t("dropdownLabel")}
        >
          <div className="notif-header">
            <span className="notif-title">{t("dropdownTitle")}</span>
            <button className="notif-mark-all" onClick={markAllRead}>
              <Icon name="check" /> {t("markAll")}
            </button>
          </div>

          <div className="notif-list">
            {notifs.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notif-item${n.unread ? " unread" : ""}`}
                role="menuitem"
                onClick={() => markRead(n.id)}
              >
                {n.unread && (
                  <span className="notif-unread-dot" aria-hidden="true" />
                )}
                <span className={`avatar ${n.avatarClass}${n.avatarSeed ? " is-orb" : ""}`} aria-hidden="true">
                  {n.avatarSeed ? (
                    <GenerativeAvatar seed={n.avatarSeed} className="orb-art" />
                  ) : (
                    n.avatarInitials
                  )}
                </span>
                <span className="notif-body">
                  <span className="notif-sender">{n.sender}</span>
                  <span className="notif-text">{n.text}</span>
                  <span className="notif-time">{n.time}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="notif-footer">
            <Link className="notif-see-all" href="/notifications">
              {t("seeAll")} <Icon name="share" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationPopup;
