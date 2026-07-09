import type { CSSProperties } from "react";
import type { MessageReaction } from "@/lib/api";

/* Shared module-scope types, constants and pure helpers for the Cohor client
   and its sub-components (extracted from CohorClient.tsx). */

/* Audience voting opens in the last 2 hours of the hackathon. Used only as a
 * fallback when the real voting-status endpoint is unavailable; the actual
 * window is driven by `votingStatus` (and the real remaining time). */
export const VOTING_WINDOW_S = 2 * 3600;

export const pad = (n: number) => String(n).padStart(2, "0");

/* Stable avatar seed for a person's display name. Folds Serbian diacritics,
   lowercases and strips spaces. The logged-in user always seeds "andrej", and
   Nenad seeds his displayed @handle so his avatar matches across surfaces. */
export function personSeed(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[đĐ]/g, "dj")
    .replace(/[šŠ]/g, "s")
    .replace(/[čćĆČ]/g, "c")
    .replace(/[žŽ]/g, "z")
    .replace(/\s+/g, "");
  if (slug === "andrejcolic") return "andrej";
  if (slug === "nenadskokovic") return "nskokovic";
  return slug;
}

/* Channel sidebar icon by the channel's real type:
 *   general       → "#" hash (text)
 *   announcements → bell icon
 *   private/team  → lock icon
 * Returns either a string (rendered as text) or an icon name to <Icon/>. */
export function channelIconKind(type: string): { hash: true } | { icon: string } {
  if (type === "announcements") return { icon: "bell" };
  if (type === "private" || type === "team") return { icon: "lock" };
  if (type === "project") return { icon: "rocket" };
  if (type === "kanban") return { icon: "list" };
  return { hash: true };
}

/* Rail icon label for a server: the leading capital letters of its name
 * (e.g. "ETF HackWeek" → "ETFH", capped at 3), or the first 3 chars. */
export function serverInitials(name: string): string {
  const caps = name.replace(/[^A-ZČĆŠĐŽ]/g, "");
  const base = caps.length > 0 ? caps : name.trim();
  return base.slice(0, 3).toUpperCase();
}

/* DM data. */
export type DmMsg = {
  av: string;
  avS: CSSProperties;
  name: string;
  nc: string;
  t: string;
  text: string;
  link?: { n: string; s: string };
};
export type DmHack = { icon: string; name: string; sub: string };
export type DmEntry = {
  av: string;
  group: boolean;
  avStyle?: CSSProperties;
  statusBg: string;
  statusLabel: string;
  fullName: string;
  handle: string;
  bio: string;
  hacks: DmHack[];
  msgs: DmMsg[];
};

export const NS_AV: CSSProperties = {
  background: "#241019",
  color: "#ff9ff3",
  border: "1px solid #3D1A3D",
};
export const AC_AV: CSSProperties = {
  background: "#241750",
  color: "var(--violet-light)",
  border: "1px solid #2D1A55",
};
export const SG_AV: CSSProperties = {
  background: "#1C1A00",
  color: "var(--lemon-vivid)",
  border: "1px solid #3A3600",
};
export const DP_AV: CSSProperties = {
  background: "#241750",
  color: "var(--violet-light)",
  border: "1px solid #2D1A55",
};

export const DM: Record<string, DmEntry> = {
  nenad: {
    av: "NS",
    group: false,
    avStyle: NS_AV,
    statusBg: "var(--lemon-vivid)",
    statusLabel: "dmStatusAway",
    fullName: "Nenad Skoković",
    handle: "@nskokovic",
    bio: "dmBioNenad",
    hacks: [{ icon: "ETF", name: "ETF HackWeek 2026", sub: "dmHackSameTeam" }],
    msgs: [
      {
        av: "NS",
        avS: NS_AV,
        name: "Nenad Skoković",
        nc: "msg-author-p",
        t: "08:23",
        text: "dmMsgKalkulator",
      },
      {
        av: "AČ",
        avS: AC_AV,
        name: "Andrej Čolić",
        nc: "msg-author-v",
        t: "08:24",
        text: "dmMsgDigitalac",
      },
    ],
  },
  digitalci: {
    av: "D",
    group: true,
    statusBg: "var(--green)",
    statusLabel: "dmStatus4Members",
    fullName: "dmNameDigitalciTeam",
    handle: "dmGroup4Members",
    bio: "dmBioDigitalci",
    hacks: [{ icon: "ETF", name: "ETF HackWeek 2026", sub: "dmHackAllTogether" }],
    msgs: [
      {
        av: "SG",
        avS: SG_AV,
        name: "Stevan Gnjato",
        nc: "msg-author-g",
        t: "08:20",
        text: "dmMsgRepoUp",
      },
      {
        av: "DP",
        avS: DP_AV,
        name: "Dimitrije Pešić",
        nc: "msg-author-v",
        t: "08:21",
        text: "dmMsgSuper",
      },
    ],
  },
};

/* Vote mapping (legacy id maps). */
export type TeamKey = "digitalci" | "ukohorisani" | "nullptr" | "lale" | "menjači";
export const VOTE_EL_KEYS: Record<string, TeamKey> = {
  "vote-btn-digitalci": "digitalci",
  "vote-btn-bytecraft": "ukohorisani",
  "vote-btn-nullptr": "nullptr",
  "vote-btn-stackframe": "lale",
  "vote-btn-menjači": "menjači",
};
export const TEAM_LABEL: Record<TeamKey, string> = {
  digitalci: "digitalci",
  ukohorisani: "ukohorisani",
  nullptr: "nullptr",
  lale: "lale",
  menjači: "menjači",
};
export const TEAM_OPTIONS: TeamKey[] = ["digitalci", "ukohorisani", "nullptr", "lale", "menjači"];

/* Accent palette cycled across real sponsor bounty cards (no per-sponsor
   styling from the backend — keeps a varied look). */
export const BOUNTY_BADGE_STYLES: { badgeStyle: CSSProperties; badgeIcon: string }[] = [
  {
    badgeStyle: { background: "#0D1A0D", color: "var(--green)", borderColor: "#0F3D30" },
    badgeIcon: "gamehub",
  },
  {
    badgeStyle: { background: "#0D0D1A", color: "var(--violet-light)", borderColor: "#2D1A55" },
    badgeIcon: "flame",
  },
  {
    badgeStyle: { background: "#1A0D0D", color: "var(--red)", borderColor: "#3D1A1A" },
    badgeIcon: "shield",
  },
];

/* A media item attached to a message being composed (uploaded as it's picked). */
export type ChatDraftMedia = {
  id: string;
  type: "image" | "video";
  previewUrl: string;
  url: string | null;
  uploading: boolean;
  error?: boolean;
};

/* Runtime message shape (server + DM streams) */
export type ChatMsg = {
  id: number;
  av: string;
  avS: CSSProperties;
  name: string;
  nc: string;
  t: string;
  text: string;
  grouped?: boolean;
  marginTop?: boolean;
};

/* Which swap-panel (or chat stream) is shown for the active channel. */
export type Panel = "messages" | "predaja" | "bounties" | "glasanje" | "rezultati" | "kanban";

export const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "avg",
  "sep",
  "okt",
  "nov",
  "dec",
];

/* Preset emoji icons offered when creating / editing a group conversation. */
export const GROUP_ICONS = ["🚀", "💻", "🔥", "🎮", "🎨", "🤝", "⚡", "🏆", "🌟", "🧠"] as const;
/* Fallback avatar for a group with no chosen icon. */
export const GROUP_ICON_FALLBACK = "👥";
/* A group icon value is either an emoji (rendered as text) or an uploaded
   image URL — relative ("/uploads/…") or absolute ("http…"). */
export const isImageIcon = (v: string | null | undefined): v is string =>
  !!v && (v.startsWith("/") || v.startsWith("http"));

/* Emoji choices offered by the message context menu's "Add reaction" row. */
export const CTX_EMOJI = ["👍", "❤️", "😂", "🎉", "🔥", "👀"] as const;

/* Merge a single reaction update into a message's reactions array.
 * Sets `symbol` to `count` (and, when provided, the `mine` flag); adds the
 * entry when missing and count>0; removes it when count===0. Existing `mine`
 * flags are preserved unless an explicit `mine` is passed. */
export function mergeReaction(
  reactions: MessageReaction[] | undefined,
  symbol: string,
  count: number,
  mine?: boolean,
): MessageReaction[] {
  const list = reactions ?? [];
  if (count <= 0) return list.filter((r) => r.symbol !== symbol);
  const exists = list.some((r) => r.symbol === symbol);
  if (exists) {
    return list.map((r) =>
      r.symbol === symbol ? { ...r, count, mine: mine === undefined ? r.mine : mine } : r,
    );
  }
  return [...list, { symbol, count, mine: mine ?? false }];
}

/* Shared inline styles for the message context menu / inline editing. */
export const CTX_EDIT_INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--violet, #7c5cff)",
  background: "var(--surface-2)",
  color: "inherit",
  font: "inherit",
};
export const CTX_EDITED_STYLE: CSSProperties = {
  marginLeft: 6,
  fontSize: 11,
  opacity: 0.55,
};
/* Subtle one-line quoted preview shown above a reply's text. */
export const MSG_REPLY_PREVIEW_STYLE: CSSProperties = {
  marginBottom: 3,
  fontSize: 12,
  opacity: 0.6,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
};
/** A forwarded message is stored as "[[fwd:<username>]]\n<original content>". */
export const FWD_RE = /^\[\[fwd:([^\]\n]+)\]\]\n([\s\S]*)$/;
export function parseForwarded(content: string): { from: string | null; body: string } {
  const m = content.match(FWD_RE);
  return m ? { from: m[1], body: m[2] } : { from: null, body: content };
}
export const CTX_MENU_ITEM_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "7px 12px",
  background: "none",
  border: "none",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 6,
};
/* Destructive variant (Delete) for the message context menu. */
export const CTX_MENU_DANGER_STYLE: CSSProperties = {
  ...CTX_MENU_ITEM_STYLE,
  color: "var(--red, #ff5c6c)",
};
