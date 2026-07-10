"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { useT } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { personName } from "@/lib/displayName";
import {
  getConversations,
  getMyActiveHackathon,
  type ActiveHackathon,
  type Conversation,
} from "@/lib/api";

/* RailRight — default right rail (Cohor comms): search box, the Cohor card and
   footer. The card shows the signed-in user's active hackathon server (if any)
   and their two newest unread DM conversations, each row deep-linking into a
   /cohor view (?home=1, ?server=…, ?dm=…). Default `right` for AppShell. */
const M = {
  cohorAria: { en: "Cohor: communication", sr: "Cohor: komunikacija" },
  searchAria: {
    en: "Search users, hackathons, organizations",
    sr: "Pretraži korisnike, hackathone, organizacije",
  },
  searchPlaceholder: { en: "Search…", sr: "Pretraži…" },
  openCohor: {
    en: "Open Cohor: servers & messages",
    sr: "Otvori Cohor: serveri i poruke",
  },
  serversMessages: { en: "Servers & messages", sr: "Serveri i poruke" },
  activeHackathon: { en: "Your active hackathon", sr: "Tvoj aktivni hackathon" },
  noUnread: { en: "No new messages", sr: "Nema novih poruka" },
  about: { en: "About", sr: "O nama" },
  accessibility: { en: "Accessibility", sr: "Pristupačnost" },
  privacy: { en: "Privacy", sr: "Privatnost" },
} as const;

/** A group icon value is either an emoji (rendered as text) or an image URL. */
function isImageIcon(v: string | null): v is string {
  return !!v && (v.startsWith("/") || v.startsWith("http"));
}

/** Badge text for the active-hackathon row: up to 3 uppercase letters of the
 *  organization name, falling back to initials of the hackathon title. */
function hackathonBadge(h: ActiveHackathon): string {
  const fromOrg = h.organizationName.trim();
  if (fromOrg) return fromOrg.replace(/\s+/g, "").slice(0, 3).toUpperCase();
  const initials = h.title
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
  return initials.slice(0, 3).toUpperCase();
}

/** Display title for a conversation row, from the viewer's perspective.
 *  A 1:1 DM shows the other member's display name (falling back to username);
 *  group titles keep using member usernames. */
function conversationTitle(c: Conversation, viewerId: string | null): string {
  const others = c.members.filter((m) => m.userId !== viewerId);
  const isGroup = c.members.length > 2;
  if (isGroup) {
    return c.name?.trim() || others.map((m) => m.username).join(", ");
  }
  // 1:1 — the single other member (fall back to any non-viewer, then name).
  const other = others[0];
  if (other) {
    return personName({ displayName: other.displayName, username: other.username });
  }
  return c.name?.trim() ?? "";
}

/** Stable avatar seed for a conversation row: always the other member's
 *  username for a 1:1 (independent of display name), else the title. */
function conversationSeed(c: Conversation, viewerId: string | null, title: string): string {
  const others = c.members.filter((m) => m.userId !== viewerId);
  const isGroup = c.members.length > 2;
  if (!isGroup && others[0]) return others[0].username;
  return title;
}

export function RailRight() {
  const t = useT(M);
  const router = useRouter();
  const { user, status } = useAuth();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeHack, setActiveHack] = useState<ActiveHackathon | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    // Only the signed-in user has conversations / an active hackathon.
    if (status === "loading") return;
    if (status !== "authenticated") {
      setState("error");
      return;
    }
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        // The hackathon lookup must not take the DM previews down with it:
        // "no active hackathon" (or a failure there) still renders the card.
        const [conversations, hackathon] = await Promise.all([
          getConversations(),
          getMyActiveHackathon().catch(() => null),
        ]);
        if (cancelled) return;
        setConvos(conversations);
        setActiveHack(hackathon);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load Cohor card data", err);
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const header = (
    <Link className="cohor-top" href="/cohor?home=1" aria-label={t("openCohor")}>
      <span className="cohor-glyph" aria-hidden="true">
        <Icon name="messages" />
      </span>
      <span className="cohor-tt">
        <span className="cohor-h2">Cohor</span>
        <span className="cohor-p">{t("serversMessages")}</span>
      </span>
    </Link>
  );

  const goToSearch = (raw: string) => {
    const q = raw.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };
  const searchBox = (
    // action/method make this work as a plain GET form even before JS hydrates
    // (Enter → /search?q=…, which the page reads); the onSubmit handler upgrades
    // it to client-side navigation once hydrated.
    <form
      className="search"
      role="search"
      action="/search"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement | null;
        goToSearch(input?.value ?? "");
      }}
    >
      <Icon name="search" />
      <input
        type="search"
        name="q"
        aria-label={t("searchAria")}
        placeholder={t("searchPlaceholder")}
      />
    </form>
  );

  // While loading, render a skeleton with the SAME footprint as the ready card
  // (header + server row + 2 DM rows) so the card never grows when data lands.
  if (state === "loading") {
    return (
      <aside className="rail-right" aria-label={t("cohorAria")}>
        {searchBox}

        <div className="cohor-card is-skeleton" aria-busy="true">
          {header}

          <div className="cohor-server" aria-hidden="true">
            <span className="cohor-srv-badge skel" />
            <span className="cohor-srv-tx">
              <span className="skel skel-line" style={{ width: "58%" }} />
              <span className="skel skel-line" style={{ width: "38%", marginTop: 7 }} />
            </span>
          </div>

          <span className="cohor-divider" />

          {[0, 1].map((i) => (
            <div className="cohor-dm-row" key={i} aria-hidden="true">
              <span className="avatar is-orb skel skel-circle" />
              <span className="cohor-dm-body">
                <span className="skel skel-line" style={{ width: "52%" }} />
                <span className="skel skel-line" style={{ width: "78%", marginTop: 7 }} />
              </span>
            </div>
          ))}
        </div>

        <Footer t={t} />
      </aside>
    );
  }

  // Logged out / failed load: minimal fallback card — header only, no rows.
  if (state !== "ready") {
    return (
      <aside className="rail-right" aria-label={t("cohorAria")}>
        {searchBox}
        <div className="cohor-card">{header}</div>
        <Footer t={t} />
      </aside>
    );
  }

  const viewerId = user?.userId ?? null;

  // Two newest UNREAD conversations: filter, sort by last message DESC, take 2.
  const unread = convos
    .filter((c) => c.unreadCount > 0)
    .sort((a, b) => {
      const at = a.lastMessage ? Date.parse(a.lastMessage.sentAt) : 0;
      const bt = b.lastMessage ? Date.parse(b.lastMessage.sentAt) : 0;
      return bt - at;
    })
    .slice(0, 2);

  const hasServerRow = activeHack !== null;
  // Divider only when there is a row above AND below it. There is always a row
  // below (either unread chats or the empty-state row).
  const showDivider = hasServerRow;

  return (
    <aside className="rail-right" aria-label={t("cohorAria")}>
      {searchBox}

      {/* The .cohor-top header link is CSS-stretched over the whole card, so
          clicks on padding/empty space open Cohor; rows sit above it. */}
      <div className="cohor-card is-populated">
        {header}

        {activeHack && (
          <Link className="cohor-server" href={`/cohor?server=${activeHack.serverId}`}>
            <span className="cohor-srv-badge" aria-hidden="true">
              {hackathonBadge(activeHack)}
            </span>
            <span className="cohor-srv-tx">
              <span className="cohor-srv-name">{activeHack.title}</span>
              <span className="cohor-srv-sub">{t("activeHackathon")}</span>
            </span>
          </Link>
        )}

        {showDivider && <span className="cohor-divider" />}

        {unread.length > 0 ? (
          unread.map((c) => {
            const title = conversationTitle(c, viewerId);
            const isGroup = c.members.length > 2;
            const seed = conversationSeed(c, viewerId, title);
            const preview = c.lastMessage
              ? `${personName({
                  displayName: c.lastMessage.senderDisplayName,
                  username: c.lastMessage.senderUsername,
                })}: ${c.lastMessage.content}`
              : "";
            return (
              <Link
                key={c.conversationId}
                className="cohor-dm-row"
                href={`/cohor?dm=${c.conversationId}`}
              >
                <span className="avatar is-orb" aria-hidden="true">
                  {isGroup && isImageIcon(c.icon) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="orb-art" src={c.icon} alt="" />
                  ) : isGroup && c.icon ? (
                    <span className="cohor-dm-emoji" aria-hidden="true">
                      {c.icon}
                    </span>
                  ) : (
                    <GenerativeAvatar seed={seed} className="orb-art" />
                  )}
                </span>
                <span className="cohor-dm-body">
                  <span className="cohor-dm-name">{title}</span>
                  <span className="cohor-dm-sub">{preview}</span>
                </span>
                <span className="cohor-unread cohor-unread--v" aria-hidden="true">
                  {c.unreadCount}
                </span>
              </Link>
            );
          })
        ) : (
          <span className="cohor-empty">{t("noUnread")}</span>
        )}
      </div>

      <Footer t={t} />
    </aside>
  );
}

function Footer({ t }: { t: (key: keyof typeof M) => string }) {
  return (
    <footer className="mini">
      <a href="#">{t("about")}</a> · <a href="#">{t("accessibility")}</a> ·{" "}
      <a href="#">{t("privacy")}</a>
      <br />
      <span className="cw">
        <b>tiki</b>miki
      </span>{" "}
      © 2026
    </footer>
  );
}

export default RailRight;
