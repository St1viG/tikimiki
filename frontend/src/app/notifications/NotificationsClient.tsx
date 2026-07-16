"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { RailRight } from "@/components/shell/RailRight";
import { useLanguage, useT } from "@/components/i18n/LanguageProvider";
import { renderNotification } from "@tikimiki/types";
import { MentionText } from "@/components/mentions/MentionText";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import { formatRelativeTime } from "@/lib/format";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/api";
import { emitNotificationsRead } from "@/lib/notificationsBus";

/**
 * NotificationsClient — interactive notifications page.
 *
 * Now data-driven from the backend:
 *   - Loads notifications via GET /api/v1/notifications.
 *   - Filter tabs (All / Unread) filter the fetched list client-side.
 *   - Mark individual read on click (outside a btn): PATCH .../read, removes the
 *     .unread class and fades the .notif-dot via .nf-fade then removes it (360 ms).
 *   - Mark all as read: POST .../mark-all-read, then fades every dot.
 *   - Groups by Today (createdAt within last 24 h) vs Earlier.
 *   - Icon is chosen by notification.type.
 *
 * Supplies its own `<main id="main">`.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "Notifications", sr: "Notifikacije" },
  pageSub: {
    en: "Everything happening in your community.",
    sr: "Sve što se dešava u tvojoj zajednici.",
  },
  filterLabel: { en: "Filter notifications", sr: "Filter notifikacija" },
  tabAll: { en: "All", sr: "Sve" },
  tabUnread: { en: "Unread", sr: "Nepročitane" },
  markAllRead: { en: "Mark all as read", sr: "Označi sve kao pročitano" },
  groupToday: { en: "Today", sr: "Danas" },
  groupEarlier: { en: "Earlier", sr: "Ranije" },
  unreadDot: { en: "unread", sr: "nepročitano" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  emptyAll: { en: "You have no notifications yet.", sr: "Još uvek nemaš notifikacija." },
  emptyUnread: { en: "You're all caught up.", sr: "Sve je pročitano." },
} as const;

type FilterMode = "sve" | "unread";

/** Local view-model: the API notification plus a transient dot-fade flag. */
interface NotifVM extends Notification {
  dotFading: boolean;
}

type NotifIcon = { name: string; cls: string };

/** Default sprite icon + `.notif-ic` modifier for unmapped types. */
const DEFAULT_ICON: NotifIcon = { name: "bell", cls: "ni-bell" };

/** Exact-match icon lookup keyed by notification type. */
const ICON_BY_TYPE: Record<string, NotifIcon> = {
  badge_awarded: { name: "trophy", cls: "ni-trophy" },
  new_follower: { name: "teams", cls: "ni-team" },
  new_direct_message: { name: "comment", cls: "ni-comment" },
  post_comment: { name: "comment", cls: "ni-comment" },
  post_reaction: { name: "like-fill", cls: "ni-like" },
};

/** Prefix-match fallbacks for grouped/namespaced types (e.g. "team_invite"). */
const ICON_BY_PREFIX: ReadonlyArray<readonly [string, NotifIcon]> = [
  ["application_", { name: "hackathon", cls: "ni-hack" }],
  ["friend_", { name: "teams", cls: "ni-team" }],
  ["team_", { name: "teams", cls: "ni-team" }],
];

/** Pick the sprite icon + the `.notif-ic` modifier class from the type. */
function iconFor(type: string): NotifIcon {
  if (type in ICON_BY_TYPE) return ICON_BY_TYPE[type];
  for (const [prefix, icon] of ICON_BY_PREFIX) {
    if (type.startsWith(prefix)) return icon;
  }
  return DEFAULT_ICON;
}

/** True when the notification was created within the last 24 hours. */
function isToday(iso: string): boolean {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < 24 * 60 * 60 * 1000;
}

export function NotificationsClient() {
  const router = useRouter();
  useRequireAuth();
  const t = useT(M);
  const { locale } = useLanguage();
  const [filter, setFilter] = useState<FilterMode>("sve");
  const [notifs, setNotifs] = useState<NotifVM[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNotifications("all")
      .then((data) => {
        if (!cancelled) setNotifs(data.map((n) => ({ ...n, dotFading: false })));
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setNotifs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mark a single notification as read (fades then removes the dot).
  function markRead(id: string) {
    let alreadyRead = true;
    setNotifs((prev) => {
      if (!prev) return prev;
      return prev.map((n) => {
        if (n.notificationId !== id) return n;
        if (n.readAt !== null) return n; // no-op for already-read
        alreadyRead = false;
        return { ...n, readAt: new Date().toISOString(), dotFading: true };
      });
    });
    if (alreadyRead) return;

    // Drop the nav rail badge right away — don't wait on the network.
    emitNotificationsRead(1);

    // Persist; revert (badge included) on failure.
    markNotificationRead(id).catch((err) => {
      console.error(err);
      emitNotificationsRead(-1);
      setNotifs((prev) =>
        prev
          ? prev.map((n) =>
              n.notificationId === id ? { ...n, readAt: null, dotFading: false } : n,
            )
          : prev,
      );
    });

    // After the fade transition, clear the dotFading flag.
    setTimeout(() => {
      setNotifs((prev) =>
        prev ? prev.map((n) => (n.notificationId === id ? { ...n, dotFading: false } : n)) : prev,
      );
    }, 360);
  }

  // Mark all as read.
  function markAll() {
    const unreadCount = (notifs ?? []).filter((n) => n.readAt === null).length;
    if (unreadCount === 0) return;

    const stamp = new Date().toISOString();
    setNotifs((prev) =>
      prev
        ? prev.map((n) => (n.readAt === null ? { ...n, readAt: stamp, dotFading: true } : n))
        : prev,
    );

    // Drop the nav rail badge right away — don't wait on the network.
    emitNotificationsRead(unreadCount);

    markAllNotificationsRead().catch((err) => {
      console.error(err);
      emitNotificationsRead(-unreadCount);
      // Reload from the server to restore the true state on failure.
      getNotifications("all")
        .then((data) => setNotifs(data.map((n) => ({ ...n, dotFading: false }))))
        .catch(() => {});
    });

    setTimeout(() => {
      setNotifs((prev) => (prev ? prev.map((n) => ({ ...n, dotFading: false })) : prev));
    }, 360);
  }

  // Filtered (by tab) list, then split into Today vs Earlier groups.
  const visible = (notifs ?? []).filter((n) => filter !== "unread" || n.readAt === null);
  const todayList = visible.filter((n) => isToday(n.createdAt));
  const earlierList = visible.filter((n) => !isToday(n.createdAt));

  const loading = notifs === null;
  const isEmpty = !loading && visible.length === 0;

  /** One placeholder row reusing the real `.notif` footprint (icon + body + time). */
  function renderSkelRow(i: number) {
    return (
      <div className="notif" key={i} aria-hidden="true">
        <span className="notif-ic skel" style={{ borderRadius: 12 }} />
        <div className="notif-body">
          <div className="notif-text">
            <span className="skel skel-line" style={{ width: "75%" }} />
            <span className="skel skel-line" style={{ width: "45%", marginTop: 7 }} />
          </div>
          <div className="notif-time">
            <span className="skel skel-line" style={{ width: "18%" }} />
          </div>
        </div>
      </div>
    );
  }

  // Notifications carry a template ({ key, params }); render it in the active
  // locale. Rows without one (pre-i18n) fall back to their stored Serbian text.
  function localizedTexts(n: NotifVM): { title: string; body: string | null } {
    if (n.template) {
      const rendered = renderNotification(n.template.key, n.template.params, locale);
      if (rendered) return rendered;
    }
    return { title: n.title, body: n.body };
  }

  function renderNotif(n: NotifVM) {
    const { name, cls } = iconFor(n.type);
    const { title, body } = localizedTexts(n);
    const showDot = n.readAt === null || n.dotFading;
    return (
      <div
        key={n.notificationId}
        className={`notif${n.readAt === null ? " unread" : ""}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".btn")) return;
          markRead(n.notificationId);
        }}
      >
        <span className={`notif-ic ${cls}`} aria-hidden="true">
          <Icon name={name} />
        </span>
        <div className="notif-body">
          <div className="notif-text">
            <b>{title}</b>
            {body ? (
              <>
                {" "}
                <MentionText>{body}</MentionText>
              </>
            ) : null}
          </div>
          <div className="notif-time">{formatRelativeTime(n.createdAt, locale)}</div>
        </div>
        {showDot ? (
          <span
            className={`notif-dot${n.dotFading ? " nf-fade" : ""}`}
            aria-label={t("unreadDot")}
          />
        ) : null}
      </div>
    );
  }

  return (
    <AppShell right={<RailRight />}>
      <main id="main">
        <div className="page-head nf-head">
          <button
            type="button"
            className="col-back"
            aria-label={t("backLabel")}
            onClick={() => router.back()}
          >
            <Icon name="arrow-left" />
          </button>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="bell" /> {t("pageTitle")}
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        <div className="tabs-row tabs-row--divided">
          <div className="nf-tabs" role="tablist" aria-label={t("filterLabel")}>
            <button
              className="feed-tab"
              role="tab"
              data-nf="sve"
              aria-selected={filter === "sve"}
              onClick={() => setFilter("sve")}
            >
              {t("tabAll")}
            </button>
            <button
              className="feed-tab"
              role="tab"
              data-nf="unread"
              aria-selected={filter === "unread"}
              onClick={() => setFilter("unread")}
            >
              {t("tabUnread")}
            </button>
          </div>
          <button className="btn btn-primary" id="mark-all" onClick={markAll}>
            <Icon name="check" /> {t("markAllRead")}
          </button>
        </div>

        {loading ? (
          <div className="notif-list" aria-busy="true">
            {[0, 1, 2, 3, 4].map(renderSkelRow)}
          </div>
        ) : isEmpty ? (
          <p className="nf-empty" id="nf-empty">
            {filter === "unread" ? t("emptyUnread") : t("emptyAll")}
          </p>
        ) : (
          <>
            {/* TODAY */}
            {todayList.length > 0 ? (
              <>
                <div className="notif-group-label">{t("groupToday")}</div>
                <div className="notif-list">{todayList.map(renderNotif)}</div>
              </>
            ) : null}

            {/* EARLIER */}
            {earlierList.length > 0 ? (
              <>
                <div className="notif-group-label">{t("groupEarlier")}</div>
                <div className="notif-list">{earlierList.map(renderNotif)}</div>
              </>
            ) : null}
          </>
        )}
      </main>
    </AppShell>
  );
}

export default NotificationsClient;
