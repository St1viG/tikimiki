"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LogoutConfirm } from "@/components/shell/LogoutConfirm";
import { ProfilePopup } from "@/components/popups/ProfilePopup";
import { OrbArt } from "@/components/ui/OrbArt";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";
import { personName } from "@/lib/displayName";
import { getSocket } from "@/lib/socket";

/* RailLeft — shared left navigation rail. Active item derived from the current
   pathname (usePathname) and marked aria-current="page". Nav labels localize via
   useT. Rendered by <AppShell/>. */

const M = {
  mainNav: { en: "Main navigation", sr: "Glavna navigacija" },
  logoAria: { en: "tikimiki: home", sr: "tikimiki: početna" },
  home: { en: "Home", sr: "Početna" },
  hackathons: { en: "Hackathons", sr: "Hackathoni" },
  teams: { en: "Teams", sr: "Timovi" },
  notifications: { en: "Notifications", sr: "Notifikacije" },
  store: { en: "Store", sr: "Prodavnica" },
  gamehub: { en: "GameHub", sr: "GameHub" },
  settings: { en: "Settings", sr: "Podešavanja" },
  premium: { en: "Premium", sr: "Premium" },
  unread: { en: "unread", sr: "nepročitanih" },
  newItems: { en: "new items", sr: "nove stavke" },
  accountMenu: { en: "Account menu", sr: "Meni naloga" },
  viewProfile: { en: "View profile", sr: "Pogledaj profil" },
  logOut: { en: "Log out", sr: "Odjavi se" },
  signIn: { en: "Sign in", sr: "Prijavi se" },
  guest: { en: "Guest", sr: "Gost" },
  signInAria: { en: "Sign in to your account", sr: "Prijavi se na svoj nalog" },
} as const;

type NavItem = {
  labelKey: keyof typeof M;
  href: string;
  icon: string;
  badge?: number;
};

const NAV_ITEMS: NavItem[] = [
  { labelKey: "home", href: "/", icon: "home" },
  { labelKey: "hackathons", href: "/hackathons", icon: "hackathon" },
  { labelKey: "teams", href: "/teams", icon: "teams" },
  { labelKey: "notifications", href: "/notifications", icon: "bell" },
  { labelKey: "store", href: "/store", icon: "cart", badge: 2 },
  { labelKey: "gamehub", href: "/gamehub", icon: "gamehub" },
  { labelKey: "settings", href: "/settings", icon: "settings" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RailLeft() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const t = useT(M);
  const { user, status, logout } = useAuth();

  /* Account menu (View profile / Log out) + logout confirmation */
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuFirstRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Menu dismissal: outside click or Escape (Escape returns focus to the
  // trigger); first item is focused on open so arrows/Tab work from there.
  useEffect(() => {
    if (!menuOpen) return;
    menuFirstRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  };

  // Live unread-notifications badge — only meaningful once authenticated.
  useEffect(() => {
    if (status !== "authenticated") {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .getUnreadCount()
        .then((res) => {
          if (!cancelled) setUnreadCount(res.count);
        })
        .catch((err) => {
          console.error("Failed to load unread notification count", err);
        });
    void load();

    // Bump the badge live when a notification arrives over the socket.
    const socket = getSocket();
    const onNotification = () => void load();
    socket?.on("notification", onNotification);

    return () => {
      cancelled = true;
      socket?.off("notification", onNotification);
    };
  }, [status]);

  return (
    <>
    <nav className="rail-left" aria-label={t("mainNav")}>
      <Link className="rail-logo" href="/" aria-label={t("logoAria")}>
        <b>tiki</b>miki
      </Link>

      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        // Notifications badge comes from the live unread count (hidden at 0);
        // other badges (e.g. store) stay on their hardcoded values.
        const badge =
          item.href === "/notifications"
            ? unreadCount > 0
              ? unreadCount
              : undefined
            : item.badge;
        return (
          <Link
            key={item.href}
            className="nav-link"
            href={item.href}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} />
            {t(item.labelKey)}
            {badge !== undefined && (
              <span
                className="nav-badge"
                aria-label={
                  item.href === "/notifications"
                    ? `${badge} ${t("unread")}`
                    : `${badge} ${t("newItems")}`
                }
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}

      <div className="rail-sep" />

      <Link
        className="premium-link"
        href="/premium"
        aria-current={isActive(pathname, "/premium") ? "page" : undefined}
      >
        <Icon name="premium" /> {t("premium")}
      </Link>

      {user ? (
        <div className="pm-wrap" ref={menuWrapRef}>
          {menuOpen && (
            <div className="pm-menu" role="menu" aria-label={t("accountMenu")}>
              <button
                type="button"
                role="menuitem"
                className="pm-menu-item"
                ref={menuFirstRef}
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(true);
                }}
              >
                <Icon name="eye" />
                {t("viewProfile")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="pm-menu-item is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmLogout(true);
                }}
              >
                <Icon name="logout" />
                {t("logOut")}
              </button>
            </div>
          )}
          <button
            type="button"
            className="profile-mini"
            ref={triggerRef}
            aria-label={`@${user.username}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="pm-av is-orb" aria-hidden="true">
              <OrbArt url={user.avatarUrl} seed={user.username} />
            </span>
            <span className="pm-info">
              <span className="pm-name">{personName(user)}</span>
              <span className="pm-user">@{user.username}</span>
            </span>
          </button>
        </div>
      ) : (
        <Link className="profile-mini" href="/login" aria-label={t("signInAria")}>
          <span className="pm-av is-orb" aria-hidden="true">
            <Icon name="logout" />
          </span>
          <span className="pm-info">
            <span className="pm-name">{t("signIn")}</span>
            <span className="pm-user">{t("guest")}</span>
          </span>
        </Link>
      )}
    </nav>

    <ProfilePopup
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        username={user?.username ?? null}
      />

    <LogoutConfirm
      open={confirmLogout}
      busy={loggingOut}
      onCancel={() => setConfirmLogout(false)}
      onConfirm={doLogout}
    />
    </>
  );
}

export default RailLeft;
