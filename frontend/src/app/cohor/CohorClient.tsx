"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT, useLanguage } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { OrbArt } from "@/components/ui/OrbArt";
import { MiniProfileCard } from "@/components/cohor/MiniProfileCard";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  useMentionAutocomplete,
  type MentionCandidate,
} from "@/components/mentions/useMentionAutocomplete";
import { MentionClickContext } from "@/components/mentions/MentionLink";
import { profileDecorationStyle, usernameEffectStyle, withDecorationClass } from "@/lib/cosmetics";
import { isUserMentioned } from "@/lib/mentions";
import { ImageLightbox } from "@/components/ImageLightbox";
import { CohorToast, type CohorToastVariant } from "@/components/popups/CohorToast";
import { BountyUnapplyModal } from "@/components/popups/BountyUnapplyModal";
import {
  getServers,
  getServer,
  getServerMembers,
  getChannelMessages,
  getConversations,
  getConversationMessages,
  markConversationRead,
  getMyActiveHackathon,
  sendChannelMessage,
  sendDirectMessage,
  uploadMedia,
  toggleMessageReaction,
  editMessage,
  getHackathonProjects,
  castVote as apiCastVote,
  getMyVote,
  getMyTeams,
  getKanbanBoard,
  createKanbanCard,
  deleteKanbanCard,
  updateKanbanCard,
  getVotingStatus,
  createConversation,
  updateConversation,
  uploadGroupIcon,
  addConversationMembers,
  startConversation,
  getRelationship,
  addFriend,
  removeFriend,
  blockUser,
  unblockUser,
  listBounties,
  applyToBounty,
  unapplyFromBounty,
  getHackathonResults,
  publishHackathonResults,
  setBountyWinner,
  getHackathon,
  getMyServerPermissions,
  getPermissionCatalog,
  getServerRoles,
  createServerRole,
  updateServerRole,
  deleteServerRole,
  addRoleMember,
  removeRoleMember,
  kickServerMember,
  updateServer,
  createChannelGroup,
  createChannel,
  renameChannel,
  deleteChannel,
  deleteMessage,
  getTeamProject,
  createProject,
  updateProject,
  submitProject,
  withdrawProject,
  uploadProjectVideo,
  ApiError,
  type ServerSummary,
  type ChatMessage as ApiMessage,
  type Conversation,
  type ProjectVote,
  type KanbanBoard,
  type KanbanCard,
  type Bounty,
  type HackathonResults,
  type ServerMember,
  type Relationship,
  type ActiveHackathon,
  type ChannelGroup,
  type Permission,
  type ServerRole,
  type Project,
} from "@/lib/api";
import type { HackathonSummary } from "@tikimiki/types";
import { getSocket } from "@/lib/socket";
import { ProfilePopup } from "@/components/popups/ProfilePopup";
import { personName } from "@/lib/displayName";
import { M } from "./strings";
import {
  RoleEditor,
  UserStrip,
  DmStream,
  DmProfile,
  BountyCard,
  ProjectCard,
  MoreProjectsStub,
  RezSelect,
} from "./components";

import {
  VOTING_WINDOW_S,
  pad,
  channelIconKind,
  serverInitials,
  AC_AV,
  DM,
  TeamKey,
  TEAM_LABEL,
  BOUNTY_BADGE_STYLES,
  ChatDraftMedia,
  ChatMsg,
  Panel,
  MONTHS,
  GROUP_ICONS,
  GROUP_ICON_FALLBACK,
  isImageIcon,
  CTX_EMOJI,
  mergeReaction,
  CTX_EDIT_INPUT_STYLE,
  CTX_EDITED_STYLE,
  MSG_REPLY_PREVIEW_STYLE,
  parseForwarded,
  CTX_MENU_ITEM_STYLE,
  CTX_MENU_DANGER_STYLE,
} from "./shared";

/*
   Cohor — full Discord-style chat app. Features:
     · live 48h hackathon timer (drives progress bar + elapsed label)
     · server / DM mode switching (rail + sidebars + main + right panels)
     · channel switching → swaps the chat stream for the matching swap-panel
       (predaja / bounties / glasanje / rezultati / kanban)
     · message sending (server + DM), reactions are static markup
     · DM switching → renders messages + profile panel from DM data
     · audience-voting countdown (opens in the last 2h), single vote
     · bounty apply / unapply (with confirm modal) + toasts
     · results form (org) → validation → published podium view
     · video upload + GitHub link (predaja panel)
   The route is full-screen (no AppShell); cohor.css is imported by layout.tsx.
 */

export function CohorClient() {
  const { user } = useRequireAuth();
  const t = useT(M);
  const { locale } = useLanguage();
  // Real audience-voting window from getVotingStatus (loaded below). Declared
  // here so the timer's isVotingOpen can prefer it over the time heuristic.
  const [votingStatus, setVotingStatus] = useState<{
    isOpen: boolean;
    opensAt: string | null;
    closesAt: string | null;
  } | null>(null);
  /* Timer (driven by the real hackathon's startsAt / endsAt)
   * `hackathon` is fetched from getHackathon(hackathonId) below. While it is
   * null we have no real numbers, so the timer card contents stay hidden and
   * the active/voting flags default to inactive (no fake countdown). */
  const [hackathon, setHackathon] = useState<HackathonSummary | null>(null);
  // Ticks once per second so the derived remaining/elapsed time stays live.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const hackStartMs = hackathon ? new Date(hackathon.startsAt).getTime() : 0;
  const hackEndMs = hackathon ? new Date(hackathon.endsAt).getTime() : 0;
  // Total window length and remaining seconds, clamped ≥ 0, from real time.
  const totalS = hackathon ? Math.max(1, Math.floor((hackEndMs - hackStartMs) / 1000)) : 0;
  const rem = hackathon ? Math.max(0, Math.floor((hackEndMs - nowMs) / 1000)) : 0;
  // Active only while now is inside [startsAt, endsAt].
  const isHackathonActive = !!hackathon && nowMs >= hackStartMs && nowMs < hackEndMs;
  // Real audience-voting window (set from getVotingStatus below) wins; otherwise
  // fall back to the last 2h of the real timer. Both are real-data driven.
  const isVotingOpen =
    votingStatus !== null ? votingStatus.isOpen : isHackathonActive && rem <= VOTING_WINDOW_S;

  const elapsedS = totalS > 0 ? Math.min(totalS, totalS - rem) : 0;
  const timerVal =
    pad(Math.floor(rem / 3600)) + ":" + pad(Math.floor((rem % 3600) / 60)) + ":" + pad(rem % 60);
  const progressPct = totalS > 0 ? ((elapsedS / totalS) * 100).toFixed(3) : "0";
  const elapsedLabel =
    t("startedAgoPre") +
    Math.floor(elapsedS / 3600) +
    t("startedAgoAfterH") +
    pad(Math.floor((elapsedS % 3600) / 60)) +
    t("startedAgoAfterMin");

  /* Mode + channel */
  const [appMode, setAppMode] = useState<"server" | "dm">("server");
  const [activeChannel, setActiveChannel] = useState("opšte");
  // The active channel's type drives which surface renders (chat / predaja /
  // kanban / …) and announcement post-gating.
  const [activeChannelType, setActiveChannelType] = useState<string>("general");
  const [panel, setPanel] = useState<Panel>("messages");
  const [topbarIcon, setTopbarIcon] = useState("#");
  const [topbarName, setTopbarName] = useState("opšte");
  const [topbarDesc, setTopbarDesc] = useState<string>(M.chOpsteDesc[locale]);
  const [inputPlaceholder, setInputPlaceholder] = useState<string>(M.msgPrefix[locale] + "opšte");

  /* Message composer (controlled: multiline, preview, attachments) */
  const [draft, setDraft] = useState("");
  const [chatPreview, setChatPreview] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const [chatMedia, setChatMedia] = useState<ChatDraftMedia[]>([]);
  // Image being previewed full-screen from a message attachment.
  const [chatLb, setChatLb] = useState<string | null>(null);

  /* Members panel visibility */
  const [membersVisible, setMembersVisible] = useState(true);

  /* Rail state */
  // dmStripNotif removed — badge is derived from real dmConvos unreadCount below
  const [showPastHacks, setShowPastHacks] = useState(false);
  const pastHacksRef = useRef<HTMLDivElement>(null);

  /* Channel read/badge state */
  const [readChannels, setReadChannels] = useState<Record<string, boolean>>({});
  const [rezultatiBadge, setRezultatiBadge] = useState<string | null>(null);
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>({});
  // Channels the user muted: no unread badge, no background counting.
  // Persisted to localStorage; loaded on mount (avoids an SSR hydration gap).
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const mutedRef = useRef<Set<string>>(mutedChannels);
  useEffect(() => {
    mutedRef.current = mutedChannels;
  }, [mutedChannels]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("cohor_muted_channels");
      if (raw) setMutedChannels(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  const activeChannelIdRef = useRef<string | null>(null);
  const [serverGroups, setServerGroups] = useState<ChannelGroup[]>([]);
  const msgIdRef = useRef(1);

  /* Moderation: my effective permissions on the active server */
  const [myPerms, setMyPerms] = useState<Set<string>>(new Set());
  const can = useCallback((perm: string) => myPerms.has(perm), [myPerms]);

  /* Live chat (real backend API)
   * Channels present in the seeded server (opšte / najave / tim-digitalci) are
   * backed by real messages; channels with no real counterpart (resursi, etc.)
   * fall back to the static fallback stream. */
  // The servers the logged-in user belongs to (role-gated server-side).
  const [servers, setServers] = useState<ServerSummary[]>([]);
  // Set once the mount fetch settles, so "you're not in a server" empty states
  // don't flash while the list is still loading.
  const [serversLoaded, setServersLoaded] = useState(false);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [chanMap, setChanMap] = useState<Record<string, string>>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ApiMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  // Real server participants (from the hackathon's applicants) + open profile.
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  // Discord-style mini profile popout (concise roles + team). Positioned
  // deterministically against the clicked element's rect (not the mouse) so the
  // whole member list stays visible — anchorTop/anchorLeft are that rect's edge.
  const [miniProfile, setMiniProfile] = useState<{
    member: ServerMember;
    anchorTop: number;
    anchorLeft: number;
  } | null>(null);
  // Measured height of the popout so it is pushed FULLY on-screen when a bottom
  // member is clicked. Default covers the typical card; re-measured per member
  // via a keyed callback ref (so taller cards still fit).
  const [miniCardH, setMiniCardH] = useState(290);
  const measureMiniCard = useCallback((el: HTMLDivElement | null) => {
    if (el) setMiniCardH(el.offsetHeight);
  }, []);
  // Discord-style RIGHT-CLICK profile context menu (Profile / Message / Friend / Block).
  // Separate from the left-click mini popout and the message context menu.
  const [profileMenu, setProfileMenu] = useState<{
    userId: string;
    username: string;
    isSelf: boolean;
    x: number;
    y: number;
    rel: Relationship | null;
  } | null>(null);
  // Guards a friend/block request in flight so we don't fire twice / fight responses.
  const [relBusy, setRelBusy] = useState(false);

  // Real direct-message conversations (replaces the mock DM panel).
  const searchParams = useSearchParams();
  const [dmConvos, setDmConvos] = useState<Conversation[]>([]);
  // Set once conversations have been fetched at least once, so the fresh-account
  // empty state doesn't flash while the list is still loading.
  const [dmLoaded, setDmLoaded] = useState(false);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [dmRealMsgs, setDmRealMsgs] = useState<ApiMessage[]>([]);

  // Nothing open on the current surface: server mode with no server, or DM
  // mode with no conversation (fresh account). Hides the channel topbar and
  // the composer instead of showing the default "#opšte" placeholder.
  const nothingOpen = appMode === "server" ? activeServerId === null : activeConvoId === null;

  // @-mention candidates are contextual: server members in a channel, the
  // conversation's members in a DM. Filtered client-side (no extra fetch).
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (appMode === "server") {
      return members.map((m) => ({
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
      }));
    }
    const convo = dmConvos.find((c) => c.conversationId === activeConvoId);
    return (convo?.members ?? []).map((m) => ({
      userId: m.userId,
      username: m.username,
      displayName: m.displayName ?? null,
      avatarUrl: m.avatarUrl,
    }));
  }, [appMode, members, dmConvos, activeConvoId]);
  const mentionSearch = useCallback(
    (q: string): MentionCandidate[] => {
      const term = q.trim().toLowerCase();
      const pool = mentionCandidates.filter((c) => c.userId !== user?.userId);
      const matches = term
        ? pool.filter(
            (c) =>
              c.username.toLowerCase().startsWith(term) ||
              (c.displayName ?? "").toLowerCase().startsWith(term),
          )
        : pool;
      return matches.slice(0, 8);
    },
    [mentionCandidates, user],
  );
  const chatMention = useMentionAutocomplete({
    inputRef: composerRef,
    value: draft,
    setValue: setDraft,
    search: mentionSearch,
  });

  // Home landing view data: the user's ongoing hackathon (or null) + friends.
  const [activeHackathon, setActiveHackathon] = useState<ActiveHackathon | null>(null);

  /* Message context menu (right-click) */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; m: ApiMessage } | null>(null);
  // Add-reaction sub-row expanded inside the menu.
  const [ctxReactOpen, setCtxReactOpen] = useState(false);
  // Two-step in-menu confirm for the destructive Delete action.
  const [ctxConfirmDelete, setCtxConfirmDelete] = useState(false);
  // Forward picker.
  const [forwardMsg, setForwardMsg] = useState<ApiMessage | null>(null);
  // Inline editing of a message.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // Reply target (drives the banner above the composer + replyToId on send).
  const [replyTo, setReplyTo] = useState<{
    messageId: string;
    username: string;
    displayName?: string | null;
  } | null>(null);

  const closeCtxMenu = useCallback(() => {
    setCtxMenu(null);
    setCtxReactOpen(false);
    setCtxConfirmDelete(false);
  }, []);

  const closeMiniProfile = useCallback(() => setMiniProfile(null), []);

  // Close the mini profile popout on any outside click or Escape while open.
  useEffect(() => {
    if (!miniProfile) return;
    const onClick = () => closeMiniProfile();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMiniProfile();
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [miniProfile, closeMiniProfile]);

  const closeProfileMenu = useCallback(() => {
    setProfileMenu(null);
    setRelBusy(false);
  }, []);

  // Open the right-click profile menu at the cursor; for non-self targets also
  // resolve the relationship in the background so friend/block labels are right.
  const openProfileMenu = useCallback(
    (target: { userId: string; username: string }, x: number, y: number) => {
      // Right-click doesn't fire a window "click", so dismiss the other floating
      // surfaces (mini popout, message menu) explicitly to keep one menu at a time.
      setMiniProfile(null);
      setCtxMenu(null);
      setCtxReactOpen(false);
      const isSelf = target.userId === user?.userId;
      setProfileMenu({
        userId: target.userId,
        username: target.username,
        isSelf,
        x,
        y,
        rel: null,
      });
      setRelBusy(false);
      if (isSelf) return;
      getRelationship(target.userId)
        .then((rel) =>
          setProfileMenu((pm) => (pm && pm.userId === target.userId ? { ...pm, rel } : pm)),
        )
        .catch(() => {
          /* leave rel null → menu falls back to "add friend" / "block" */
        });
    },
    [user?.userId],
  );

  // Close the profile context menu on any outside click or Escape while open.
  useEffect(() => {
    if (!profileMenu) return;
    const onClick = () => closeProfileMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProfileMenu();
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [profileMenu, closeProfileMenu]);

  // Apply one reaction's new state to a message in whichever live list holds it.
  const applyReaction = useCallback(
    (messageId: string, symbol: string, count: number, mine: boolean) => {
      const patch = (m: ApiMessage) =>
        m.messageId === messageId
          ? { ...m, reactions: mergeReaction(m.reactions, symbol, count, mine) }
          : m;
      setMsgs((prev) => prev.map(patch));
      setDmRealMsgs((prev) => prev.map(patch));
    },
    [],
  );

  // Toggle a reaction on a message (chips + context menu share this).
  const toggleReactionOn = useCallback(
    async (messageId: string, symbol: string) => {
      try {
        const r = await toggleMessageReaction(messageId, symbol);
        applyReaction(messageId, r.symbol, r.count, r.reacted);
      } catch (err) {
        console.error(err);
      }
    },
    [applyReaction],
  );

  // Subtle one-line quoted preview for a reply, looked up in the same list.
  const renderReplyPreview = useCallback(
    (m: ApiMessage, list: ApiMessage[]) => {
      if (!m.replyToId) return null;
      const ref = list.find((x) => x.messageId === m.replyToId);
      const text = ref
        ? `↩ ${personName({
            displayName: ref.senderDisplayName,
            username: ref.senderUsername,
          })}: ${ref.content.length > 60 ? ref.content.slice(0, 60) + "…" : ref.content}`
        : t("msgReplyFallback");
      return (
        <div className="msg-reply-preview" style={MSG_REPLY_PREVIEW_STYLE} title={text}>
          {text}
        </div>
      );
    },
    [t],
  );

  // Quoted "↪ forwarded from <user>" header for forwarded messages.
  const renderForwardPreview = useCallback(
    (m: ApiMessage) => {
      const f = parseForwarded(m.content);
      if (!f.from) return null;
      const text = `↪ ${t("ctxForwardedFrom")} ${f.from}`;
      return (
        <div className="msg-reply-preview" style={MSG_REPLY_PREVIEW_STYLE} title={text}>
          {text}
        </div>
      );
    },
    [t],
  );

  // Image/video attachments shown beneath a message's text.
  const renderAttachments = useCallback((m: ApiMessage) => {
    if (!m.attachments || m.attachments.length === 0) return null;
    return (
      <div className="msg-attachments">
        {m.attachments.map((a, i) =>
          a.type === "video" ? (
            <video key={i} className="msg-att" src={a.url} controls preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              className="msg-att"
              src={a.url}
              alt={a.filename ?? ""}
              loading="lazy"
              role="button"
              tabIndex={0}
              onClick={() => setChatLb(a.url)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setChatLb(a.url);
                }
              }}
            />
          ),
        )}
      </div>
    );
  }, []);

  // Close the context menu on any outside click or Escape while it is open.
  useEffect(() => {
    if (!ctxMenu) return;
    const onClick = () => closeCtxMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCtxMenu();
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu, closeCtxMenu]);

  // Close the past hackathons dropdown on any outside click or Escape.
  useEffect(() => {
    if (!showPastHacks) return;
    const onClick = () => setShowPastHacks(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowPastHacks(false);
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [showPastHacks]);

  // Real Kanban board for the user's first team.
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myTeamName, setMyTeamName] = useState<string | null>(null);
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  // Inline "add card" composer: which column is composing + its draft fields.
  const [addingCol, setAddingCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDesc, setNewCardDesc] = useState("");
  const [newCardBusy, setNewCardBusy] = useState(false);

  // Group-DM creation modal.
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupIcon, setGroupIcon] = useState("");
  const [groupIconUploading, setGroupIconUploading] = useState(false);
  const createIconInputRef = useRef<HTMLInputElement | null>(null);

  // Group settings panel (rename / re-icon / add members) for the active group.
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [gsName, setGsName] = useState("");
  const [gsIcon, setGsIcon] = useState("");
  const [gsIconUploading, setGsIconUploading] = useState(false);
  const gsIconInputRef = useRef<HTMLInputElement | null>(null);
  const [gsAddPick, setGsAddPick] = useState<string[]>([]);

  /* Channel management (manage_channels) */
  // Create-channel modal (group prefilled). null = closed.
  const [chCreate, setChCreate] = useState<{ groupId: string } | null>(null);
  const [chCreateName, setChCreateName] = useState("");
  const [chCreateType, setChCreateType] = useState<"general" | "announcements" | "private">(
    "general",
  );
  const [chCreateErr, setChCreateErr] = useState<string | null>(null);
  const [chBusy, setChBusy] = useState(false);
  // Create-group modal. null = closed.
  const [grpCreateOpen, setGrpCreateOpen] = useState(false);
  const [grpCreateName, setGrpCreateName] = useState("");
  // Right-click channel context menu.
  const [chCtx, setChCtx] = useState<{
    x: number;
    y: number;
    channelId: string;
    name: string;
    type: string;
  } | null>(null);
  const [chCtxConfirmDelete, setChCtxConfirmDelete] = useState(false);
  // Rename-channel modal.
  const [chRename, setChRename] = useState<{
    channelId: string;
    name: string;
    type: string;
  } | null>(null);
  const [chRenameName, setChRenameName] = useState("");

  // Close the channel context menu on any outside click or Escape while open.
  useEffect(() => {
    if (!chCtx) return;
    const close = () => {
      setChCtx(null);
      setChCtxConfirmDelete(false);
    };
    const onClick = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [chCtx]);

  /* Server settings modal (manage_server / manage_roles / kick_members) */
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"overview" | "roles" | "members">("overview");
  // Overview tab draft fields.
  const [ovName, setOvName] = useState("");
  const [ovLogo, setOvLogo] = useState<string | null>(null);
  const [ovBanner, setOvBanner] = useState<string | null>(null);
  const [ovLogoUploading, setOvLogoUploading] = useState(false);
  const [ovBannerUploading, setOvBannerUploading] = useState(false);
  const [ovBusy, setOvBusy] = useState(false);
  const [ovErr, setOvErr] = useState<string | null>(null);
  // Roles tab data.
  const [permCatalog, setPermCatalog] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [rolesErr, setRolesErr] = useState<string | null>(null);
  // Role editor: "new" for the create form, or a roleId being edited.
  const [roleEditing, setRoleEditing] = useState<string | null>(null);
  const [roleDraftName, setRoleDraftName] = useState("");
  const [roleDraftPerms, setRoleDraftPerms] = useState<Set<string>>(new Set());
  // Per-role membership management: which role's member panel is expanded.
  const [roleMembersOpen, setRoleMembersOpen] = useState<string | null>(null);
  const [membersErr, setMembersErr] = useState<string | null>(null);
  // Inline two-step confirms (no browser confirm()): roleId / userId pending.
  const [roleConfirmDelete, setRoleConfirmDelete] = useState<string | null>(null);
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);
  const ovLogoInputRef = useRef<HTMLInputElement | null>(null);
  const ovBannerInputRef = useRef<HTMLInputElement | null>(null);

  const dmOtherName = (c: Conversation) =>
    c.members
      .filter((m) => m.userId !== user?.userId)
      .map((m) => personName({ displayName: m.displayName, username: m.username }))
      .join(", ") || "—";

  // A conversation is treated as a GROUP once it has more than two participants.
  const isGroupConvo = (c: Conversation) => c.members.length > 2;
  // Display title for a conversation row / header: group name (or member names
  // as a fallback) for groups, the other person's name for 1-1 DMs.
  const convoTitle = (c: Conversation) =>
    isGroupConvo(c) ? c.name?.trim() || dmOtherName(c) : dmOtherName(c);
  // Stable avatar seed for a 1-1 DM row: always the other member's USERNAME so
  // the avatar never shifts when a display name is set. Falls back to the title.
  const convoSeed = (c: Conversation) => {
    const other = c.members.find((m) => m.userId !== user?.userId);
    return other?.username ?? convoTitle(c);
  };
  // The other member's uploaded avatar for a 1-1 DM row (null → generated).
  const dmOtherAvatarUrl = (c: Conversation) =>
    c.members.find((m) => m.userId !== user?.userId)?.avatarUrl ?? null;

  const openConvo = (id: string, convs?: Conversation[]) => {
    const list = convs ?? dmConvos;
    const c = list.find((x) => x.conversationId === id);
    const nm = c ? convoTitle(c) : "";
    const group = c ? isGroupConvo(c) : false;
    setActiveConvoId(id);
    setActiveDm(null);
    setTopbarIcon(group ? c?.icon || GROUP_ICON_FALLBACK : "@");
    setTopbarName(nm);
    setTopbarDesc("");
    setInputPlaceholder(t("msgPrefixDm") + nm);
    setDmRealMsgs([]);
    getConversationMessages(id)
      .then(setDmRealMsgs)
      .catch(() => setDmRealMsgs([]));
    // Mark the convo read server-side (fire-and-forget) and optimistically
    // clear its unread badge locally so it disappears immediately.
    markConversationRead(id).catch(() => {});
    setDmConvos((prev) =>
      prev.map((c) => (c.conversationId === id ? { ...c, unreadCount: 0 } : c)),
    );
  };

  const loadDmConvos = (openId?: string) => {
    getConversations()
      .then((convs) => {
        setDmConvos(convs);
        setDmLoaded(true);
        const target =
          openId && convs.some((c) => c.conversationId === openId)
            ? openId
            : convs[0]?.conversationId;
        if (target) openConvo(target, convs);
      })
      .catch(() => {
        setDmConvos([]);
        setDmLoaded(true);
      });
  };
  // Presence (online user ids) + per-channel typing indicator.
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef(0);

  const loadChannelMessages = useCallback((channelId: string) => {
    setChatLoading(true);
    getChannelMessages(channelId)
      .then((msgs) => setMsgs(msgs))
      .catch(() => setMsgs([]))
      .finally(() => setChatLoading(false));
  }, []);

  // Live updates: receive broadcast messages for the active channel
  // (rooms are joined/left by the global chanMap effect below).
  useEffect(() => {
    if (!activeChannelId) return;
    activeChannelIdRef.current = activeChannelId;
    const s = getSocket();
    if (!s) return;
    const onMessage = (msg: ApiMessage) => {
      if (msg.channelId !== activeChannelId) return;
      setMsgs((prev) => (prev.some((m) => m.messageId === msg.messageId) ? prev : [...prev, msg]));
      requestAnimationFrame(() => {
        if (serverMsgsRef.current)
          serverMsgsRef.current.scrollTop = serverMsgsRef.current.scrollHeight;
      });
    };
    s.on("channelMessage", onMessage);

    const onTyping = (p: { channelId: string; username: string }) => {
      if (p.channelId !== activeChannelId) return;
      if (user && p.username === user.username) return;
      setTypingUser(p.username);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setTypingUser(null), 3500);
    };
    s.on("userTyping", onTyping);

    const onReaction = (p: { messageId: string; symbol: string; count: number }) => {
      setMsgs((prev) =>
        prev.map((m) =>
          m.messageId === p.messageId
            ? { ...m, reactions: mergeReaction(m.reactions, p.symbol, p.count) }
            : m,
        ),
      );
    };
    s.on("messageReaction", onReaction);

    const onDeleted = (p: { messageId: string; channelId?: string }) => {
      setMsgs((prev) => prev.filter((m) => m.messageId !== p.messageId));
    };
    s.on("messageDeleted", onDeleted);

    return () => {
      s.off("channelMessage", onMessage);
      s.off("userTyping", onTyping);
      s.off("messageReaction", onReaction);
      s.off("messageDeleted", onDeleted);
      setTypingUser(null);
    };
  }, [activeChannelId, user]);

  // When the server's channel map changes: join ALL channel rooms so that
  // messages on non-active channels are received and counted as unread.
  useEffect(() => {
    const channelIds = Object.values(chanMap);
    if (channelIds.length === 0) return;
    const s = getSocket();
    if (!s) return;
    channelIds.forEach((id) => s.emit("joinChannel", id));
    const onBgMsg = (msg: ApiMessage) => {
      if (!msg.channelId || msg.channelId === activeChannelIdRef.current) return;
      if (mutedRef.current.has(msg.channelId)) return; // muted → don't count
      setChannelUnread((prev) => ({
        ...prev,
        [msg.channelId!]: (prev[msg.channelId!] ?? 0) + 1,
      }));
    };
    s.on("channelMessage", onBgMsg);
    return () => {
      channelIds.forEach((id) => s.emit("leaveChannel", id));
      s.off("channelMessage", onBgMsg);
    };
  }, [chanMap]);

  // Lock page scroll to a full-screen app ONLY while /cohor is mounted, then
  // restore it — avoids the global body{overflow:hidden} CSS leaking app-wide.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHeight = document.body.style.height;
    document.body.style.overflow = "hidden";
    document.body.style.height = "100vh";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.height = prevHeight;
    };
  }, []);

  // Deep link: /cohor?dm=<conversationId> opens DM mode on that conversation.
  const dmParam = searchParams.get("dm");
  // Deep link: /cohor?server=<serverId> opens that server (handled once the
  // servers list has loaded, in the mount effect below).
  const serverParam = searchParams.get("server");
  // Deep link: /cohor?server=<id>&channel=<name> also selects a channel by
  // name once that server's channel tree has loaded (e.g. the "Add project"
  // button on /teams links straight to #predaja-projekta). Consumed once.
  const channelParam = searchParams.get("channel");
  const channelDeepLinkConsumed = useRef(false);
  useEffect(() => {
    if (!channelParam || channelDeepLinkConsumed.current) return;
    const cid = chanMap[channelParam];
    if (!cid) return;
    let type = "general";
    for (const g of serverGroups) {
      const ch = g.channels.find((c) => c.name === channelParam);
      if (ch) {
        type = ch.type;
        break;
      }
    }
    channelDeepLinkConsumed.current = true;
    switchChannel(channelParam, "", type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelParam, chanMap, serverGroups]);
  useEffect(() => {
    if (!dmParam) return;
    setAppMode("dm");
    setPanel("messages");
    loadDmConvos(dmParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmParam]);

  // Live updates for the active DM conversation.
  useEffect(() => {
    if (!activeConvoId) return;
    const s = getSocket();
    if (!s) return;
    s.emit("joinConversation", activeConvoId);
    const onDm = (msg: ApiMessage) => {
      if (msg.conversationId !== activeConvoId) return;
      setDmRealMsgs((prev) =>
        prev.some((m) => m.messageId === msg.messageId) ? prev : [...prev, msg],
      );
    };
    const onReaction = (p: { messageId: string; symbol: string; count: number }) => {
      setDmRealMsgs((prev) =>
        prev.map((m) =>
          m.messageId === p.messageId
            ? { ...m, reactions: mergeReaction(m.reactions, p.symbol, p.count) }
            : m,
        ),
      );
    };
    const onDeleted = (p: { messageId: string; conversationId?: string }) => {
      setDmRealMsgs((prev) => prev.filter((m) => m.messageId !== p.messageId));
    };
    s.on("directMessage", onDm);
    s.on("messageReaction", onReaction);
    s.on("messageDeleted", onDeleted);
    return () => {
      s.emit("leaveConversation", activeConvoId);
      s.off("directMessage", onDm);
      s.off("messageReaction", onReaction);
      s.off("messageDeleted", onDeleted);
    };
  }, [activeConvoId]);

  // Presence: keep the set of currently-online user ids in sync.
  // We also emit "getPresence" immediately after registering the listener
  // because the initial connect broadcast fires before this useEffect runs.
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onPresence = (p: { online: string[] }) => setOnlineUsers(new Set(p.online));
    s.on("presence", onPresence);
    s.emit("getPresence");
    return () => {
      s.off("presence", onPresence);
    };
  }, []);

  /** Throttled "I'm typing" ping for the active channel (max ~1/1.5s). */
  function emitTyping() {
    if (!activeChannelId || !user) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 1500) return;
    lastTypingEmitRef.current = now;
    getSocket()?.emit("typing", {
      channelId: activeChannelId,
      username: user.username,
    });
  }

  /* Real audience voting */
  const [hackathonId, setHackathonId] = useState<string | null>(null);
  const [realProjects, setRealProjects] = useState<ProjectVote[]>([]);
  const [myVotedProjectId, setMyVotedProjectId] = useState<string | null>(null);
  // votingStatus state is declared near the timer (top of the component).

  /* Load a single server: its channels (→ chanMap + default channel +
   * messages) and its members. `srvSummary` carries the hackathonId; when
   * omitted we fall back to the known `servers` list. */
  const loadServer = useCallback(
    async (serverId: string, summary: ServerSummary) => {
      setActiveServerId(serverId);
      setHackathonId(summary.hackathonId);
      // Reset per-server moderation state so a switch never shows stale perms.
      setMyPerms(new Set());
      try {
        const detail = await getServer(serverId);
        const map: Record<string, string> = {};
        for (const g of detail.groups) for (const c of g.channels) map[c.name] = c.channelId;
        setChanMap(map);
        setServerGroups(detail.groups);
        const def = map["opšte"] ?? Object.values(map)[0];
        if (def) {
          setActiveChannelId(def);
          loadChannelMessages(def);
        } else {
          setActiveChannelId(null);
        }
      } catch {
        /* server detail unavailable — leave channels empty */
      }
      try {
        const serverMembers = await getServerMembers(serverId);
        // Keep the full ServerMember shape (incl. displayName + isModerator).
        setMembers(serverMembers);
      } catch {
        /* members list may be restricted — leave members empty */
      }
      try {
        const { permissions } = await getMyServerPermissions(serverId);
        setMyPerms(new Set(permissions));
      } catch {
        /* permissions unavailable — treat as no moderation powers */
      }
    },
    [loadChannelMessages],
  );

  /* Re-fetch a server's channel tree (after a local mutation or a socket
   * channel-change / serverUpdated event) and keep chanMap + groups in sync.
   * If the active channel disappeared remotely, fall back to the first one. */
  const refreshServerDetail = useCallback(
    async (serverId: string) => {
      try {
        const detail = await getServer(serverId);
        const map: Record<string, string> = {};
        for (const g of detail.groups) for (const c of g.channels) map[c.name] = c.channelId;
        setChanMap(map);
        setServerGroups(detail.groups);
        // Active channel gone (deleted remotely) → switch to the first one.
        const stillThere = Object.values(map).includes(activeChannelIdRef.current ?? "");
        if (!stillThere) {
          const firstName = Object.keys(map)[0];
          if (firstName) {
            const cid = map[firstName];
            setActiveChannel(firstName);
            setActiveChannelId(cid);
            setTopbarName(firstName);
            setTopbarDesc("");
            setPanel("messages");
            loadChannelMessages(cid);
          } else {
            setActiveChannelId(null);
            setMsgs([]);
          }
        }
      } catch {
        /* leave the current tree in place on failure */
      }
    },
    [loadChannelMessages],
  );

  /* Re-fetch members + my permissions (after a rolesChanged socket event). */
  const refreshMembersAndPerms = useCallback(async (serverId: string) => {
    try {
      const serverMembers = await getServerMembers(serverId);
      setMembers(serverMembers);
    } catch {
      /* ignore */
    }
    try {
      const { permissions } = await getMyServerPermissions(serverId);
      setMyPerms(new Set(permissions));
    } catch {
      /* ignore */
    }
  }, []);

  // Live server-room updates: join the active server's room and react to
  // channel / role / server changes broadcast by the backend.
  useEffect(() => {
    if (!activeServerId) return;
    const s = getSocket();
    if (!s) return;
    const sid = activeServerId;
    s.emit("joinServer", sid);
    const onChannelChange = (p: { serverId: string }) => {
      if (p.serverId !== sid) return;
      refreshServerDetail(sid);
    };
    const onServerUpdated = (p: { serverId: string }) => {
      if (p.serverId !== sid) return;
      refreshServerDetail(sid);
      // Reflect a renamed server in the rail / sidebar list too.
      getServers()
        .then(setServers)
        .catch(() => {});
    };
    const onRolesChanged = (p: { serverId: string }) => {
      if (p.serverId !== sid) return;
      refreshMembersAndPerms(sid);
    };
    s.on("channelCreated", onChannelChange);
    s.on("channelUpdated", onChannelChange);
    s.on("channelDeleted", onChannelChange);
    s.on("serverUpdated", onServerUpdated);
    s.on("rolesChanged", onRolesChanged);
    return () => {
      s.emit("leaveServer", sid);
      s.off("channelCreated", onChannelChange);
      s.off("channelUpdated", onChannelChange);
      s.off("channelDeleted", onChannelChange);
      s.off("serverUpdated", onServerUpdated);
      s.off("rolesChanged", onRolesChanged);
    };
  }, [activeServerId, refreshServerDetail, refreshMembersAndPerms]);

  // Fetch the active server's hackathon (drives the timer + hack-info card).
  useEffect(() => {
    if (!hackathonId) {
      setHackathon(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const h = await getHackathon(hackathonId);
        if (!cancelled) setHackathon(h);
      } catch {
        if (!cancelled) setHackathon(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  // Mount: fetch the servers the user belongs to + the active hackathon, then
  // pick the initial view. Entry rule (also when "cohor" is clicked from the
  // feed): if there's an active hackathon → open its server; otherwise → open
  // Direct messages. Deep links (?dm=, ?server=) override this.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, active] = await Promise.all([
          getServers(),
          getMyActiveHackathon().catch(() => null),
          // Fetch conversations on mount so the DM unread badge is accurate
          // even while the user is in server mode.
          getConversations()
            .then((convs) => {
              setDmConvos(convs);
              setDmLoaded(true);
            })
            .catch(() => {}),
        ]);
        if (cancelled) return;
        setServers(list);
        setServersLoaded(true);
        setActiveHackathon(active);
        // A ?dm= deep link owns the initial view (handled in its own effect).
        if (dmParam) return;
        // ?server=<id> deep link: open that server.
        if (serverParam) {
          const target = list.find((s) => s.serverId === serverParam);
          if (target) {
            enterServerMode();
            await loadServer(target.serverId, target);
            return;
          }
        }
        // Active hackathon → its server; else → Direct messages.
        const activeServer = active && list.find((s) => s.serverId === active.serverId);
        if (activeServer) {
          enterServerMode();
          await loadServer(activeServer.serverId, activeServer);
        } else {
          enterDmMode();
        }
      } catch {
        /* ignore — chat falls back to the static fallback stream */
        if (!cancelled) setServersLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // dmParam/serverParam are read once on mount; enter*Mode/loadServer are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadServer]);

  // Load the hackathon's real submitted projects + the user's existing vote.
  useEffect(() => {
    if (!hackathonId) return;
    let cancelled = false;
    (async () => {
      try {
        const [projects, mine] = await Promise.all([
          getHackathonProjects(hackathonId),
          getMyVote(hackathonId),
        ]);
        if (cancelled) return;
        setRealProjects(projects);
        setMyVotedProjectId(mine.projectId);
      } catch {
        /* ignore — fall back to the static fallback project list */
      }
      try {
        const status = await getVotingStatus(hackathonId);
        if (!cancelled)
          setVotingStatus({
            isOpen: status.isOpen,
            opensAt: status.opensAt,
            closesAt: status.closesAt,
          });
      } catch {
        /* ignore — fall back to the time-based isVotingOpen heuristic */
      }
      try {
        const real = await listBounties(hackathonId);
        if (!cancelled) setBounties(real);
      } catch {
        /* ignore — fall back to the static fallback bounty cards */
      }
      try {
        const res = await getHackathonResults(hackathonId);
        if (!cancelled) {
          setResults(res);
          // Prefill the organizer form's sponsor selects with current winners.
          if (res.bountyWinners.length > 0) {
            setBountyWinners(
              Object.fromEntries(res.bountyWinners.map((w) => [w.bountyId, w.teamName])),
            );
          }
        }
      } catch {
        /* ignore — fall back to the static results form/podium */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  // Resolve the user's team *for the active server's hackathon* (drives the
  // real Kanban board + project submission panel). Re-runs on server switch
  // so it never shows a team from a different hackathon.
  useEffect(() => {
    setMyTeamId(null);
    setMyTeamName(null);
    if (!hackathonId) return;
    let cancelled = false;
    (async () => {
      try {
        const teams = await getMyTeams();
        if (cancelled) return;
        const mine = teams.find((tm) => tm.hackathonId === hackathonId);
        if (mine) {
          setMyTeamId(mine.teamId);
          setMyTeamName(mine.name);
        }
      } catch {
        /* ignore — fall back to the static fallback board */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  /** Reset + repopulate the predaja form fields from a (possibly null) project. */
  function applyProject(p: Project | null) {
    setProject(p);
    setRepoInput(p?.repositoryUrl ?? "");
    setRepoEditing(!p?.repositoryUrl);
  }

  // Load the team's project (predaja panel) whenever the resolved team changes.
  useEffect(() => {
    if (!myTeamId) {
      applyProject(null);
      return;
    }
    let cancelled = false;
    setProjectLoading(true);
    getTeamProject(myTeamId)
      .then((p) => {
        if (!cancelled) applyProject(p);
      })
      .catch(() => {
        if (!cancelled) applyProject(null);
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeamId]);

  // Load the Kanban board whenever the resolved team changes.
  useEffect(() => {
    if (!myTeamId) return;
    let cancelled = false;
    (async () => {
      try {
        const b = await getKanbanBoard(myTeamId);
        if (!cancelled) setBoard(b);
      } catch {
        /* ignore — keep the static fallback board */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [myTeamId]);

  // Refetch the board (after a card create / delete).
  const refreshBoard = useCallback(() => {
    if (!myTeamId) return;
    getKanbanBoard(myTeamId)
      .then(setBoard)
      .catch(() => {
        /* ignore */
      });
  }, [myTeamId]);

  // Open the inline "add card" composer in a column (clears any draft).
  const openAddCard = useCallback((columnId: string) => {
    setAddingCol(columnId);
    setNewCardTitle("");
    setNewCardDesc("");
  }, []);

  // Submit the inline composer → create the card, refetch the board, reset.
  const submitNewCard = useCallback(() => {
    if (!myTeamId || !addingCol || newCardBusy) return;
    const title = newCardTitle.trim();
    if (!title) return;
    const description = newCardDesc.trim() || undefined;
    setNewCardBusy(true);
    createKanbanCard(myTeamId, { columnId: addingCol, title, description })
      .then(() => refreshBoard())
      .then(() => {
        setAddingCol(null);
        setNewCardTitle("");
        setNewCardDesc("");
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setNewCardBusy(false));
  }, [myTeamId, addingCol, newCardTitle, newCardDesc, newCardBusy, refreshBoard]);

  // Delete a card, then refetch the board.
  const removeCard = useCallback(
    (cardId: string) => {
      deleteKanbanCard(cardId)
        .then(() => refreshBoard())
        .catch(() => {
          /* ignore */
        });
    },
    [refreshBoard],
  );

  // Move a card to another column via drag-and-drop (optimistic).
  const onDropCard = useCallback(
    (cardId: string | null, targetColumnId: string) => {
      if (!board || !cardId) return;
      const sourceCol = board.columns.find((c) => c.cards.some((card) => card.cardId === cardId));
      const card = sourceCol?.cards.find((c) => c.cardId === cardId);
      // No source / already in the target column → nothing to do.
      if (!card || card.columnId === targetColumnId) return;
      const targetCol = board.columns.find((c) => c.columnId === targetColumnId);
      if (!targetCol) return;
      const nextPosition = targetCol.cards.length;
      // Optimistically move the card so the board updates instantly.
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((c) => {
            if (c.columnId === card.columnId) {
              return {
                ...c,
                cards: c.cards.filter((cc) => cc.cardId !== cardId),
              };
            }
            if (c.columnId === targetColumnId) {
              return {
                ...c,
                cards: [
                  ...c.cards,
                  {
                    ...card,
                    columnId: targetColumnId,
                    position: nextPosition,
                  },
                ],
              };
            }
            return c;
          }),
        };
      });
      updateKanbanCard(cardId, { columnId: targetColumnId })
        .then(() => refreshBoard())
        .catch(() => refreshBoard());
    },
    [board, refreshBoard],
  );

  // Close the create-group modal and clear its draft fields.
  const closeGroupModal = useCallback(() => {
    setShowGroupModal(false);
    setGroupPick([]);
    setGroupName("");
    setGroupIcon("");
  }, []);

  // Create a group conversation from the picked member ids, then open it.
  const createGroupConvo = useCallback(() => {
    if (groupPick.length === 0) return;
    createConversation(groupPick, groupName.trim() || undefined, groupIcon || undefined)
      .then((convo) => {
        setShowGroupModal(false);
        setGroupPick([]);
        setGroupName("");
        setGroupIcon("");
        loadDmConvos(convo.conversationId);
      })
      .catch(() => {
        setShowGroupModal(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupPick, groupName, groupIcon]);

  // Open the group-settings panel for the active group, seeding its fields
  // from the current conversation's name / icon.
  const openGroupSettings = useCallback(() => {
    const conv = dmConvos.find((c) => c.conversationId === activeConvoId);
    if (!conv) return;
    setGsName(conv.name ?? "");
    setGsIcon(conv.icon ?? "");
    setGsAddPick([]);
    setShowGroupSettings(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvoId, dmConvos]);

  // Persist name / icon changes to the active group, then refresh the list.
  const saveGroupSettings = useCallback(() => {
    if (!activeConvoId) return;
    updateConversation(activeConvoId, {
      name: gsName.trim() || null,
      icon: gsIcon || null,
    })
      .then(() => loadDmConvos(activeConvoId))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvoId, gsName, gsIcon]);

  // Add the selected members to the active group, then refresh the list.
  const addGroupMembers = useCallback(
    (userIds: string[]) => {
      if (!activeConvoId || userIds.length === 0) return;
      addConversationMembers(activeConvoId, userIds)
        .then(() => {
          setGsAddPick([]);
          loadDmConvos(activeConvoId);
        })
        .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [activeConvoId],
  );

  /* Toast */
  const [toast, setToast] = useState<{
    variant: CohorToastVariant;
    icon: string;
    content: ReactNode;
    show: boolean;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback(
    (variant: CohorToastVariant, icon: string, content: ReactNode, ms: number) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ variant, icon, content, show: true });
      toastTimer.current = setTimeout(() => {
        setToast((t) => (t ? { ...t, show: false } : t));
      }, ms);
    },
    [],
  );

  /* Channel management actions (manage_channels) */

  // Open the create-channel modal for a given group.
  const openCreateChannel = useCallback((groupId: string) => {
    setChCreate({ groupId });
    setChCreateName("");
    setChCreateType("general");
    setChCreateErr(null);
  }, []);

  // Create a channel in the modal's group; 409 → inline "name taken".
  const submitCreateChannel = useCallback(async () => {
    if (!activeServerId || !chCreate) return;
    const name = chCreateName.trim();
    if (!name) return;
    setChBusy(true);
    setChCreateErr(null);
    try {
      await createChannel(activeServerId, {
        groupId: chCreate.groupId,
        name,
        type: chCreateType,
      });
      setChCreate(null);
      // Refetch our own tree (socket event would also fire; refresh is idempotent).
      await refreshServerDetail(activeServerId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setChCreateErr(t("chNameTaken"));
      else setChCreateErr(t("chActionFailed"));
    } finally {
      setChBusy(false);
    }
  }, [activeServerId, chCreate, chCreateName, chCreateType, refreshServerDetail, t]);

  // Create a channel group.
  const submitCreateGroup = useCallback(async () => {
    if (!activeServerId) return;
    const name = grpCreateName.trim();
    if (!name) return;
    setChBusy(true);
    try {
      await createChannelGroup(activeServerId, name);
      setGrpCreateOpen(false);
      setGrpCreateName("");
      await refreshServerDetail(activeServerId);
    } catch {
      showToast("red", "x", <>{t("chActionFailed")}</>, 4000);
    } finally {
      setChBusy(false);
    }
  }, [activeServerId, grpCreateName, refreshServerDetail, showToast, t]);

  // Rename a channel from the rename modal.
  const submitRenameChannel = useCallback(async () => {
    if (!activeServerId || !chRename) return;
    const name = chRenameName.trim();
    if (!name || name === chRename.name) {
      setChRename(null);
      return;
    }
    setChBusy(true);
    try {
      await renameChannel(chRename.channelId, name);
      // If the active channel was renamed, keep the topbar / active name in sync.
      if (activeChannelId === chRename.channelId) {
        setActiveChannel(name);
        setTopbarName(name);
      }
      setChRename(null);
      await refreshServerDetail(activeServerId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409)
        showToast("red", "x", <>{t("chNameTaken")}</>, 4000);
      else showToast("red", "x", <>{t("chActionFailed")}</>, 4000);
    } finally {
      setChBusy(false);
    }
  }, [activeServerId, chRename, chRenameName, activeChannelId, refreshServerDetail, showToast, t]);

  // Delete a channel; if it's the active one, switch away gracefully.
  const submitDeleteChannel = useCallback(
    async (channelId: string) => {
      if (!activeServerId) return;
      setChCtx(null);
      setChCtxConfirmDelete(false);
      try {
        await deleteChannel(channelId);
        await refreshServerDetail(activeServerId);
        // refreshServerDetail already falls back when the active channel is gone.
      } catch {
        showToast("red", "x", <>{t("chActionFailed")}</>, 4000);
      }
    },
    [activeServerId, refreshServerDetail, showToast, t],
  );

  /* Server-settings actions (manage_server / manage_roles / kick_members) */

  // Open the settings modal, seeding overview fields + loading roles/catalog.
  const openServerSettings = useCallback(() => {
    const summary = servers.find((s) => s.serverId === activeServerId);
    setOvName(summary?.name ?? "");
    setOvLogo(summary?.logoUrl ?? null);
    setOvBanner(null); // server summary carries no banner; settable, not shown
    setOvErr(null);
    // First permitted tab.
    setSettingsTab(can("manage_server") ? "overview" : can("manage_roles") ? "roles" : "members");
    setServerSettingsOpen(true);
    // Load roles + permission catalog if allowed.
    if (activeServerId && can("manage_roles")) {
      getPermissionCatalog()
        .then(setPermCatalog)
        .catch(() => {});
      getServerRoles(activeServerId)
        .then(setRoles)
        .catch(() => setRolesErr(t("chActionFailed")));
    }
  }, [servers, activeServerId, can, t]);

  const refreshRoles = useCallback(() => {
    if (!activeServerId) return;
    getServerRoles(activeServerId)
      .then(setRoles)
      .catch(() => {});
  }, [activeServerId]);

  // Save overview (name + logo + banner).
  const saveOverview = useCallback(async () => {
    if (!activeServerId) return;
    setOvBusy(true);
    setOvErr(null);
    try {
      await updateServer(activeServerId, {
        name: ovName.trim() || undefined,
        logoUrl: ovLogo,
        bannerUrl: ovBanner,
      });
      await getServers()
        .then(setServers)
        .catch(() => {});
      showToast("violet", "check", <>{t("srvOvSaved")}</>, 2500);
    } catch (err) {
      setOvErr(err instanceof ApiError ? err.message : t("chActionFailed"));
    } finally {
      setOvBusy(false);
    }
  }, [activeServerId, ovName, ovLogo, ovBanner, showToast, t]);

  // Start creating a new role (open the inline editor).
  const startNewRole = useCallback(() => {
    setRoleEditing("new");
    setRoleDraftName("");
    setRoleDraftPerms(new Set());
    setRolesErr(null);
  }, []);

  // Start editing an existing role.
  const startEditRole = useCallback((r: ServerRole) => {
    setRoleEditing(r.serverRoleId);
    setRoleDraftName(r.name);
    setRoleDraftPerms(new Set(r.permissions));
    setRolesErr(null);
  }, []);

  const toggleDraftPerm = useCallback((perm: string) => {
    setRoleDraftPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }, []);

  // Save the role editor (create or PATCH with the full permission array).
  const saveRole = useCallback(async () => {
    if (!activeServerId || !roleEditing) return;
    const name = roleDraftName.trim();
    if (!name) return;
    const perms = Array.from(roleDraftPerms);
    setRolesErr(null);
    try {
      if (roleEditing === "new") {
        await createServerRole(activeServerId, { name, permissions: perms });
      } else {
        await updateServerRole(activeServerId, roleEditing, {
          name,
          permissions: perms,
        });
      }
      setRoleEditing(null);
      refreshRoles();
      // My own permissions may have changed if I edited a role I carry.
      try {
        const { permissions } = await getMyServerPermissions(activeServerId);
        setMyPerms(new Set(permissions));
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setRolesErr(t("srvRoleNameTaken"));
      else setRolesErr(err instanceof ApiError ? err.message : t("chActionFailed"));
    }
  }, [activeServerId, roleEditing, roleDraftName, roleDraftPerms, refreshRoles, t]);

  // Delete a role (members lose its permissions).
  const removeRole = useCallback(
    async (roleId: string) => {
      if (!activeServerId) return;
      try {
        await deleteServerRole(activeServerId, roleId);
        refreshRoles();
        refreshMembersAndPerms(activeServerId);
      } catch (err) {
        setRolesErr(err instanceof ApiError ? err.message : t("chActionFailed"));
      }
    },
    [activeServerId, refreshRoles, refreshMembersAndPerms, t],
  );

  // Add a member to a role (then refresh roles + members).
  const addMemberToRole = useCallback(
    async (roleId: string, userId: string) => {
      if (!activeServerId) return;
      try {
        await addRoleMember(activeServerId, roleId, userId);
        refreshRoles();
        refreshMembersAndPerms(activeServerId);
      } catch (err) {
        setRolesErr(err instanceof ApiError ? err.message : t("chActionFailed"));
      }
    },
    [activeServerId, refreshRoles, refreshMembersAndPerms, t],
  );

  // Remove a member from a role.
  const removeMemberFromRole = useCallback(
    async (roleId: string, userId: string) => {
      if (!activeServerId) return;
      try {
        await removeRoleMember(activeServerId, roleId, userId);
        refreshRoles();
        refreshMembersAndPerms(activeServerId);
      } catch (err) {
        setRolesErr(err instanceof ApiError ? err.message : t("chActionFailed"));
      }
    },
    [activeServerId, refreshRoles, refreshMembersAndPerms, t],
  );

  // Kick a member from the server, then refetch members.
  const kickMember = useCallback(
    async (userId: string) => {
      if (!activeServerId) return;
      try {
        await kickServerMember(activeServerId, userId);
        refreshMembersAndPerms(activeServerId);
        showToast("violet", "check", <>{t("srvKicked")}</>, 2500);
      } catch (err) {
        setMembersErr(err instanceof ApiError ? err.message : t("srvKickFailed"));
      }
    },
    [activeServerId, refreshMembersAndPerms, showToast, t],
  );

  /* DM state */
  const [activeDm, setActiveDm] = useState<string | null>(null);
  const [dmExtra, setDmExtra] = useState<Record<string, ChatMsg[]>>({});

  /* Voting */
  const [votes, setVotes] = useState<Record<TeamKey, number>>({
    digitalci: 0,
    ukohorisani: 0,
    nullptr: 0,
    lale: 0,
    menjači: 0,
  });
  const [myVote, setMyVote] = useState<TeamKey | null>(null);

  /* Bounties */
  // Real sponsor bounties loaded from the backend for the active hackathon.
  const [bounties, setBounties] = useState<Bounty[]>([]);
  // The bounty pending a withdraw confirmation (drives BountyUnapplyModal).
  const [unapplyTarget, setUnapplyTarget] = useState<Bounty | null>(null);

  /* Group-icon image upload (create modal + settings modal)
     Reads the first picked file, uploads it via the shared API helper and
     stores the returned URL in the matching icon state (replacing any emoji).
     The hidden <input> is reset afterwards so re-picking the same file fires
     onChange again. Failures clear the flag and surface a toast. */
  const handleIconFileChange = useCallback(
    (
      e: ReactChangeEvent<HTMLInputElement>,
      setUploading: (v: boolean) => void,
      setIcon: (v: string) => void,
    ) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      uploadGroupIcon(file)
        .then((res) => {
          setIcon(res.url);
        })
        .catch(() => {
          showToast("red", "x", <>{t("grpUploadFailed")}</>, 3600);
        })
        .finally(() => {
          setUploading(false);
          input.value = "";
        });
    },
    [showToast, t],
  );

  /* Profile context-menu actions (right-click menu) */

  // Open (or create) a 1:1 DM with the menu target, switch to DM mode, open it.
  const pmMessage = useCallback(
    async (userId: string) => {
      closeProfileMenu();
      try {
        const convoId = await startConversation(userId);
        enterDmMode();
        loadDmConvos(convoId);
      } catch (err) {
        if (err instanceof ApiError) {
          showToast("red", "x", <>{err.message}</>, 4000);
        }
      }
    },
    // enterDmMode / loadDmConvos are stable component-scope functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeProfileMenu, showToast],
  );

  // Add or remove a friend depending on current status; reflect the new rel.
  const pmToggleFriend = useCallback(
    async (userId: string, isFriend: boolean) => {
      if (relBusy) return;
      setRelBusy(true);
      try {
        const rel = isFriend ? await removeFriend(userId) : await addFriend(userId);
        setProfileMenu((pm) => (pm && pm.userId === userId ? { ...pm, rel } : pm));
        if (!isFriend) showToast("violet", "check", <>{t("pmFriendAdded")}</>, 2500);
      } catch (err) {
        if (err instanceof ApiError) showToast("red", "x", <>{err.message}</>, 4000);
      } finally {
        setRelBusy(false);
      }
    },
    [relBusy, showToast, t],
  );

  // Block or unblock the target; reflect the new rel and toast the outcome.
  const pmToggleBlock = useCallback(
    async (userId: string, isBlocked: boolean) => {
      if (relBusy) return;
      setRelBusy(true);
      try {
        const rel = isBlocked ? await unblockUser(userId) : await blockUser(userId);
        setProfileMenu((pm) => (pm && pm.userId === userId ? { ...pm, rel } : pm));
        showToast(
          isBlocked ? "violet" : "red",
          isBlocked ? "check" : "x",
          <>{t(isBlocked ? "pmUnblocked" : "pmBlocked")}</>,
          2500,
        );
      } catch (err) {
        if (err instanceof ApiError) showToast("red", "x", <>{err.message}</>, 4000);
      } finally {
        setRelBusy(false);
      }
    },
    [relBusy, showToast, t],
  );

  /* Context-menu actions */

  // Toggle a reaction (any emoji) on a message from the context menu, then close it.
  const ctxReact = useCallback(
    (messageId: string, symbol: string) => {
      closeCtxMenu();
      toggleReactionOn(messageId, symbol);
    },
    [toggleReactionOn, closeCtxMenu],
  );

  // Begin inline editing of one's own message.
  const ctxStartEdit = useCallback(
    (m: ApiMessage) => {
      setEditingId(m.messageId);
      setEditDraft(m.content);
      closeCtxMenu();
    },
    [closeCtxMenu],
  );

  // Commit an inline edit; updates content + editedAt in whichever live list holds it.
  const commitEdit = useCallback(
    async (messageId: string) => {
      const next = editDraft.trim();
      if (!next) {
        setEditingId(null);
        return;
      }
      try {
        const r = await editMessage(messageId, next);
        setMsgs((prev) =>
          prev.map((m) =>
            m.messageId === messageId ? { ...m, content: r.content, editedAt: r.editedAt } : m,
          ),
        );
        setDmRealMsgs((prev) =>
          prev.map((m) =>
            m.messageId === messageId ? { ...m, content: r.content, editedAt: r.editedAt } : m,
          ),
        );
        setEditingId(null);
      } catch (err) {
        const forbidden = err instanceof ApiError && err.status === 403;
        const msg = forbidden ? t("ctxEditForbidden") : t("ctxEditFailed");
        showToast("red", "x", <>{msg}</>, 4000);
      }
    },
    [editDraft, showToast, t],
  );

  // Set the reply target (banner renders above the composer).
  const ctxStartReply = useCallback(
    (m: ApiMessage) => {
      setReplyTo({
        messageId: m.messageId,
        username: m.senderUsername,
        displayName: m.senderDisplayName,
      });
      closeCtxMenu();
    },
    [closeCtxMenu],
  );

  // Build forwarded content prefixed with a "forwarded from <user>" marker.
  const buildForwarded = useCallback(
    (src: ApiMessage) => `[[fwd:${src.senderUsername}]]\n${src.content}`,
    [],
  );

  // Forward a message's content to a target channel or DM conversation.
  const forwardToChannel = useCallback(
    async (channelId: string) => {
      const src = forwardMsg;
      setForwardMsg(null);
      closeCtxMenu();
      if (!src) return;
      try {
        await sendChannelMessage(channelId, buildForwarded(src));
        showToast("violet", "share", <>{t("ctxForwarded")}</>, 2500);
      } catch (err) {
        console.error(err);
      }
    },
    [forwardMsg, closeCtxMenu, showToast, t, buildForwarded],
  );

  const forwardToConvo = useCallback(
    async (conversationId: string) => {
      const src = forwardMsg;
      setForwardMsg(null);
      closeCtxMenu();
      if (!src) return;
      try {
        await sendDirectMessage(conversationId, buildForwarded(src));
        showToast("violet", "share", <>{t("ctxForwarded")}</>, 2500);
      } catch (err) {
        console.error(err);
      }
    },
    [forwardMsg, closeCtxMenu, showToast, t, buildForwarded],
  );

  // Copy a message's content to the clipboard.
  const ctxCopy = useCallback(
    (content: string) => {
      closeCtxMenu();
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(content).catch(() => {});
      }
      showToast("violet", "check", <>{t("ctxCopied")}</>, 2500);
    },
    [closeCtxMenu, showToast, t],
  );

  // Delete a message. Optimistically removes it from whichever live list holds
  // it (the messageDeleted socket event covers other clients).
  const ctxDelete = useCallback(
    async (m: ApiMessage) => {
      closeCtxMenu();
      setMsgs((prev) => prev.filter((x) => x.messageId !== m.messageId));
      setDmRealMsgs((prev) => prev.filter((x) => x.messageId !== m.messageId));
      try {
        await deleteMessage(m.messageId);
      } catch {
        showToast("red", "x", <>{t("ctxDeleteFailed")}</>, 4000);
      }
    },
    [closeCtxMenu, showToast, t],
  );

  // Cast a real audience vote for one of the hackathon's submitted projects.
  const voteForProject = useCallback(
    async (projectId: string) => {
      if (!hackathonId || myVotedProjectId) return;
      try {
        const r = await apiCastVote(hackathonId, projectId);
        setMyVotedProjectId(projectId);
        const votedName = realProjects.find((p) => p.projectId === projectId)?.title ?? "";
        setRealProjects((prev) =>
          prev.map((p) =>
            p.projectId === projectId ? { ...p, voteCount: r.voteCount, hasUserVoted: true } : p,
          ),
        );
        showToast(
          "violet",
          "leaderboard",
          <>
            {t("voteToastPre")}
            <strong style={{ color: "var(--violet-light)" }}>{votedName}</strong>
            {t("voteToastPost")}
          </>,
          3000,
        );
      } catch {
        /* ignore — backend governs vote eligibility */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hackathonId, myVotedProjectId, realProjects],
  );

  /* Rezultati form */
  const [rezForm, setRezForm] = useState({
    rank1: "",
    rank2: "",
    rank3: "",
    publike: "",
  });
  // Per-bounty winning team selections — key = bountyId, value = chosen teamName.
  const [bountyWinners, setBountyWinners] = useState<Record<string, string>>({});
  const [rezError, setRezError] = useState<string | null>(null);
  const [rezPublished, setRezPublished] = useState<typeof rezForm | null>(null);
  const [rezSaved, setRezSaved] = useState<typeof rezForm | null>(null);
  const [rezTimestamp, setRezTimestamp] = useState<string>(M.rezTimestampDefault[locale]);
  // Real official results loaded from the backend for the active hackathon.
  const [results, setResults] = useState<HackathonResults | null>(null);

  /* Predaja: real project submission — repo/video, backed by
   * /teams/:teamId/project. `myTeamId` scopes it to the caller's team in the
   * active hackathon's server. The project itself is created transparently
   * (titled after the team) the first time a video or repo link is saved. */
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectBusy, setProjectBusy] = useState<"submit" | "withdraw" | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [videoError, setVideoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoReplaceInputRef = useRef<HTMLInputElement | null>(null);

  const [repoInput, setRepoInput] = useState("");
  const [repoEditing, setRepoEditing] = useState(true);
  const [repoError, setRepoError] = useState(false);
  const [repoFocused, setRepoFocused] = useState(false);
  const [repoBusy, setRepoBusy] = useState(false);

  /* Scroll refs for the message streams */
  const serverMsgsRef = useRef<HTMLDivElement | null>(null);
  const dmMsgsRef = useRef<HTMLDivElement | null>(null);

  /* Scroll to bottom on every channel switch — covers static channels (resursi,
     etc.) that have no real messages and would otherwise stay at the top. */
  useEffect(() => {
    requestAnimationFrame(() => {
      if (serverMsgsRef.current)
        serverMsgsRef.current.scrollTop = serverMsgsRef.current.scrollHeight;
    });
  }, [activeChannel]);

  /* Scroll to bottom when real messages finish loading (async, fires after the
     channel-switch effect above so it wins for channels backed by the API). */
  useEffect(() => {
    if (serverMsgsRef.current) serverMsgsRef.current.scrollTop = serverMsgsRef.current.scrollHeight;
  }, [msgs]);

  /* Scroll to bottom whenever real DM messages load or new ones arrive. */
  useEffect(() => {
    if (dmMsgsRef.current) dmMsgsRef.current.scrollTop = dmMsgsRef.current.scrollHeight;
  }, [dmRealMsgs]);

  /* Mode switching */
  function enterDmMode() {
    setAppMode("dm");
    setPanel("messages");
    loadDmConvos();
  }

  const enterServerMode = useCallback(() => {
    setAppMode("server");
    setTopbarIcon("#");
  }, []);

  // Switch to a server in the rail: enter server mode, then (re)load its
  // channels, messages and members.
  const switchServer = useCallback(
    (srv: ServerSummary) => {
      enterServerMode();
      void loadServer(srv.serverId, srv);
    },
    [enterServerMode, loadServer],
  );

  /* Channel context-menu actions (available to every member) */
  function markChannelReadLocal(channelId: string, name: string) {
    setChannelUnread((prev) => ({ ...prev, [channelId]: 0 }));
    setReadChannels((r) => ({ ...r, [name]: true }));
  }
  function toggleMuteChannel(channelId: string) {
    setMutedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      try {
        window.localStorage.setItem("cohor_muted_channels", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  /* Channel switching */
  function switchChannel(name: string, desc: string, type = "general") {
    // rezultati is locked while the hackathon is active
    if (name === "rezultati" && isHackathonActive) {
      showRezultatiLockedToast();
      return;
    }
    setActiveChannel(name);
    setActiveChannelType(type);
    const cid = chanMap[name];
    setActiveChannelId(cid ?? null);
    if (cid) {
      loadChannelMessages(cid);
      setChannelUnread((prev) => ({ ...prev, [cid]: 0 }));
    }
    setReadChannels((r) => ({ ...r, [name]: true }));
    setTopbarIcon("#");
    setTopbarName(name);
    setTopbarDesc(desc || "");
    setInputPlaceholder(t("msgPrefix") + name);

    // Route by channel TYPE first (project → submission, kanban → board); fall
    // back to the legacy name-based mapping for voting / results / bounties.
    if (type === "project") setPanel("predaja");
    else if (type === "kanban") setPanel("kanban");
    else if (name === "predaja-projekta") setPanel("predaja");
    else if (name === "glasanje-publike") setPanel("glasanje");
    else if (name === "rezultati") setPanel("rezultati");
    else if (name === "bounties") setPanel("bounties");
    else if (name === "moj-tim-board") setPanel("kanban");
    else setPanel("messages");
  }

  /* Composer: attachments + autogrow */
  function autoGrowChat() {
    const ta = composerRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }
  function onPickChatMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = 10 - chatMedia.length;
    for (const file of files.slice(0, Math.max(0, room))) {
      const id = `${Date.now()}-${Math.round(performance.now())}-${file.name}`;
      const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      const previewUrl = URL.createObjectURL(file);
      setChatMedia((prev) => [...prev, { id, type, previewUrl, url: null, uploading: true }]);
      uploadMedia(file)
        .then((res) =>
          setChatMedia((prev) =>
            prev.map((m) => (m.id === id ? { ...m, url: res.url, uploading: false } : m)),
          ),
        )
        .catch(() =>
          setChatMedia((prev) =>
            prev.map((m) => (m.id === id ? { ...m, uploading: false, error: true } : m)),
          ),
        );
    }
  }
  function removeChatMedia(id: string) {
    setChatMedia((prev) => {
      const f = prev.find((m) => m.id === id);
      if (f) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((m) => m.id !== id);
    });
  }

  /* Send message */
  function sendMsgClick() {
    const text = draft.trim();
    if (chatMedia.some((m) => m.uploading)) return; // wait for uploads to finish
    const ready = chatMedia.filter((m) => m.url).map((m) => m.url as string);
    if (!text && ready.length === 0) return;
    const replyToId = replyTo?.messageId;
    const clear = () => {
      setDraft("");
      setChatPreview(false);
      chatMedia.forEach((m) => URL.revokeObjectURL(m.previewUrl));
      setChatMedia([]);
      if (composerRef.current) composerRef.current.style.height = "auto";
    };
    if (appMode === "server") {
      if (!activeChannelId) return;
      sendChannelMessage(activeChannelId, text, replyToId, ready)
        .then((created) => {
          // Dedupe: the socket echo of our own message may arrive before
          // this resolves, so skip if it's already in the list.
          setMsgs((m) => (m.some((x) => x.messageId === created.messageId) ? m : [...m, created]));
          requestAnimationFrame(() => {
            if (serverMsgsRef.current)
              serverMsgsRef.current.scrollTop = serverMsgsRef.current.scrollHeight;
          });
        })
        .catch((err) => console.error(err));
      setReplyTo(null);
    } else if (activeConvoId) {
      sendDirectMessage(activeConvoId, text, replyToId, ready)
        .then((created) => {
          setDmRealMsgs((m) =>
            m.some((x) => x.messageId === created.messageId) ? m : [...m, created],
          );
          requestAnimationFrame(() => {
            if (dmMsgsRef.current) dmMsgsRef.current.scrollTop = dmMsgsRef.current.scrollHeight;
          });
        })
        .catch((err) => console.error(err));
      setReplyTo(null);
    } else if (activeDm) {
      const now = new Date();
      const dmMsg: ChatMsg = {
        id: ++msgIdRef.current,
        av: "??",
        avS: AC_AV,
        name: user?.username ?? "?",
        nc: "msg-author-v",
        t: pad(now.getHours()) + ":" + pad(now.getMinutes()),
        text,
        marginTop: true,
      };
      setDmExtra((m) => ({ ...m, [activeDm]: [...(m[activeDm] || []), dmMsg] }));
      requestAnimationFrame(() => {
        if (dmMsgsRef.current) dmMsgsRef.current.scrollTop = dmMsgsRef.current.scrollHeight;
      });
    }
    clear();
  }
  // Enter sends; Shift+Enter inserts a newline (multiline messages).
  function sendMsg(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (chatMention.onKeyDown(e)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMsgClick();
    }
  }
  // Wrap the textarea's current selection with Markdown markers (controlled).
  function insertMd(open: string, close: string) {
    const ta = composerRef.current;
    if (!ta) return;
    const v = ta.value;
    const s = ta.selectionStart ?? v.length;
    const e = ta.selectionEnd ?? s;
    const sel = v.slice(s, e);
    setDraft(v.slice(0, s) + open + sel + close + v.slice(e));
    const caret = s + open.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret + sel.length);
      autoGrowChat();
    });
  }
  const MD_TOOLS = [
    { key: "mdBold" as const, label: <b>B</b>, wrap: ["**", "**"] as const },
    { key: "mdItalic" as const, label: <i>I</i>, wrap: ["_", "_"] as const },
    {
      key: "mdStrike" as const,
      label: <span className="strike">S</span>,
      wrap: ["~~", "~~"] as const,
    },
    {
      key: "mdCode" as const,
      label: <span className="code">{"</>"}</span>,
      wrap: ["`", "`"] as const,
    },
    {
      key: "mdLink" as const,
      label: <Icon name="link" className="ic-sm" />,
      wrap: ["[", "](url)"] as const,
    },
  ];

  /* Toggle right panel */
  function toggleRightPanel() {
    if (appMode === "server") setMembersVisible((v) => !v);
  }

  /* Voting */
  // Seconds until voting opens: from the real opensAt when known, else from the
  // real remaining time minus the 2h window. Both are real-data driven.
  const votingCountdownLabel = useMemo(() => {
    const secsUntil =
      votingStatus?.opensAt != null
        ? Math.floor((new Date(votingStatus.opensAt).getTime() - nowMs) / 1000)
        : rem - VOTING_WINDOW_S;
    if (secsUntil <= 0) return t("votingOpensZero");
    const h = Math.floor(secsUntil / 3600);
    const m = Math.floor((secsUntil % 3600) / 60);
    return h > 0
      ? t("votingOpensInH") + h + t("hUnit") + pad(m) + t("minUnit")
      : t("votingOpensInMin") + m + t("minUnit");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rem, nowMs, votingStatus, locale]);

  function castVote(btnTeam: TeamKey) {
    if (!isVotingOpen || myVote !== null) return;
    setMyVote(btnTeam);
    setVotes((prev) => {
      const next = { ...prev };
      // Seed plausible existing tallies the first time someone votes.
      if (next.ukohorisani === 0) {
        next.ukohorisani = 14;
        next.nullptr = 11;
        next.lale = 8;
        next.menjači = 6;
        if (!next.digitalci) next.digitalci = 9;
      }
      next[btnTeam] += 1;
      return next;
    });
    showToast(
      "violet",
      "leaderboard",
      <>
        {t("voteToastPre")}
        <strong style={{ color: "var(--violet-light)" }}>{TEAM_LABEL[btnTeam]}</strong>
        {t("voteToastPost")}
      </>,
      3000,
    );
  }

  /* Rezultati locked toast */
  function showRezultatiLockedToast() {
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const label = h > 0 ? h + t("hUnit") + pad(m) + t("minUnit") : m + t("minUnit");
    showToast(
      "violet",
      "lock",
      <>
        {t("channelUnlocksPre")}
        <strong style={{ color: "var(--violet-light)" }}>{label}</strong>
      </>,
      3000,
    );
  }

  const rezultatiLockedCountdown = useMemo(() => {
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    return h > 0
      ? t("hackEndsInH") + h + t("hUnit") + pad(m) + t("minUnit")
      : t("hackEndsInMin") + m + t("minUnit");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rem, locale]);

  /* Bounty apply / unapply */
  // Sync one bounty card from an apply/unapply API response.
  function patchBounty(bountyId: string, hasApplied: boolean, applicantCount: number) {
    setBounties((prev) =>
      prev.map((x) => (x.bountyId === bountyId ? { ...x, hasApplied, applicantCount } : x)),
    );
  }
  // Apply the user's team to a bounty (direct), or open the withdraw
  // confirmation modal when already applied.
  async function applyBounty(b: Bounty) {
    if (!hackathonId) return;
    if (b.hasApplied) {
      setUnapplyTarget(b);
      return;
    }
    try {
      const res = await applyToBounty(hackathonId, b.bountyId);
      patchBounty(b.bountyId, true, res.applicantCount);
      showToast(
        "lemon",
        "coin",
        <>
          {t("bountyAppliedToastPre")}
          <strong style={{ color: "var(--lemon-vivid)" }}>{myTeamName ?? "digitalci"}</strong>
          {t("bountyAppliedToastMid")}
          <strong style={{ color: "var(--lemon-vivid)" }}>{b.title}</strong>
          {t("bountyAppliedToastPost")}
        </>,
        3500,
      );
    } catch {
      /* ignore — backend governs bounty eligibility */
    }
  }
  // Confirm withdrawing the user's team from the pending bounty.
  async function confirmUnapply() {
    const b = unapplyTarget;
    if (!b || !hackathonId) return;
    setUnapplyTarget(null);
    try {
      const res = await unapplyFromBounty(hackathonId, b.bountyId);
      patchBounty(b.bountyId, false, res.applicantCount);
      showToast(
        "red",
        "arrow-left",
        <>
          {t("bountyUnappliedToastPre")}
          <strong style={{ color: "var(--red)" }}>{b.title}</strong>
          {t("bountyUnappliedToastPost")}
        </>,
        3500,
      );
    } catch {
      /* ignore — backend governs bounty eligibility */
    }
  }

  /* Rezultati form */
  function onRankChange(field: keyof typeof rezForm, value: string) {
    setRezForm((f) => ({ ...f, [field]: value }));
    setRezError(null);
  }
  async function submitRezultati() {
    const { rank1, rank2, rank3, publike } = rezForm;
    if (!rank1 || !rank2 || !rank3 || !publike) {
      setRezError(t("rezErrAllFields"));
      return;
    }
    // Every loaded sponsor bounty needs a winning team selected.
    if (bounties.length > 0 && bounties.some((b) => !bountyWinners[b.bountyId])) {
      setRezError(t("rezErrAllFields"));
      return;
    }
    if (new Set([rank1, rank2, rank3]).size !== 3) {
      setRezError(t("rezErrDuplicate"));
      return;
    }
    // Publish the official results to the backend. The form models teams by
    // name, so map each chosen team to its real submitted project id.
    if (hackathonId) {
      const projectIdFor = (teamName: string) =>
        realProjects.find((p) => p.teamName === teamName)?.projectId ?? null;
      const rankings = [
        { projectId: projectIdFor(rank1), rank: 1 },
        { projectId: projectIdFor(rank2), rank: 2 },
        { projectId: projectIdFor(rank3), rank: 3 },
      ].filter((r): r is { projectId: string; rank: number } => r.projectId !== null);
      if (rankings.length > 0) {
        try {
          const res = await publishHackathonResults(hackathonId, rankings);
          setResults(res);
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            showToast("red", "x", <>{t("rezForbidden")}</>, 4000);
            return;
          }
          /* other errors fall through to the local fallback publish */
        }
      }
      // Persist each sponsor bounty's winning team, mapping team name → project.
      try {
        let lastRes: HackathonResults | null = null;
        for (const b of bounties) {
          const projectId = projectIdFor(bountyWinners[b.bountyId] ?? "");
          if (projectId) {
            lastRes = await setBountyWinner(hackathonId, b.bountyId, projectId);
          }
        }
        if (lastRes) setResults(lastRes);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          showToast("red", "x", <>{t("rezForbidden")}</>, 4000);
          return;
        }
        /* other errors fall through to the local fallback publish */
      }
    }
    setRezSaved(rezForm);
    setRezPublished(rezForm);
    const now = new Date();
    setRezTimestamp(
      `${t("rezPublishedAt")}${now.getDate()}. ${MONTHS[now.getMonth()]} ${now.getFullYear()}.${t(
        "rezPublishedAtMid",
      )}${pad(now.getHours())}:${pad(now.getMinutes())}${t("rezPublishedAtPost")}`,
    );
    setRezultatiBadge(t("rezNewBadge"));
  }
  function editRezultati() {
    if (!rezSaved) return;
    setRezForm(rezSaved);
    setRezPublished(null);
    setRezError(null);
  }

  /* Video upload */
  function projectErrorMessage(e: unknown): string {
    if (e instanceof ApiError && e.message) return e.message;
    return t("projectGenericError");
  }

  /**
   * The video/repo sections work the moment the panel opens, with no separate
   * "create project" step — the very first upload/save transparently creates
   * the draft (titled after the team) if one doesn't exist yet.
   */
  async function ensureProject(): Promise<Project> {
    if (project) return project;
    if (!myTeamId) throw new Error("no team");
    const created = await createProject(myTeamId, { title: myTeamName?.trim() || "Untitled" });
    setProject(created);
    return created;
  }

  async function handleSubmitProject() {
    if (!project || projectBusy) return;
    setProjectBusy("submit");
    setProjectError(null);
    try {
      applyProject(await submitProject(project.projectId));
    } catch (e) {
      setProjectError(projectErrorMessage(e));
    } finally {
      setProjectBusy(null);
    }
  }

  async function handleWithdrawProject() {
    if (!project || projectBusy) return;
    setProjectBusy("withdraw");
    setProjectError(null);
    try {
      applyProject(await withdrawProject(project.projectId));
    } catch (e) {
      setProjectError(projectErrorMessage(e));
    } finally {
      setProjectBusy(null);
    }
  }

  const videoErrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashVideoError(msg: string) {
    setDragOver(false);
    setVideoError(msg);
    if (videoErrTimer.current) clearTimeout(videoErrTimer.current);
    videoErrTimer.current = setTimeout(() => setVideoError(null), 4000);
  }

  /** Upload a picked video to `/uploads/video`, then persist it on the project. */
  async function processVideoFile(f: File) {
    if (!myTeamId) return;
    const allowed = [
      "video/mp4",
      "video/quicktime",
      "video/avi",
      "video/x-msvideo",
      "video/webm",
      "video/ogg",
    ];
    const maxBytes = 500 * 1024 * 1024;
    if (!f.type.startsWith("video/") && !allowed.includes(f.type)) {
      flashVideoError(t("videoErrFormat"));
      return;
    }
    if (f.size > maxBytes) {
      flashVideoError(t("videoErrSize"));
      return;
    }
    setDragOver(false);
    setUploadingVideo(true);
    setVideoError(null);
    try {
      const target = await ensureProject();
      const { url } = await uploadProjectVideo(f);
      applyProject(await updateProject(target.projectId, { videoUrl: url }));
    } catch (e) {
      flashVideoError(projectErrorMessage(e));
    } finally {
      setUploadingVideo(false);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
      if (videoReplaceInputRef.current) videoReplaceInputRef.current.value = "";
    }
  }
  async function removeVideo() {
    if (!project) return;
    setUploadingVideo(true);
    setVideoError(null);
    try {
      applyProject(await updateProject(project.projectId, { videoUrl: null }));
    } catch (e) {
      flashVideoError(projectErrorMessage(e));
    } finally {
      setUploadingVideo(false);
    }
  }

  /* Repository URL */
  function isValidUrl(v: string): boolean {
    try {
      // eslint-disable-next-line no-new
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }
  async function saveGithub() {
    if (!myTeamId) return;
    const val = repoInput.trim();
    if (!isValidUrl(val)) {
      setRepoError(true);
      return;
    }
    setRepoError(false);
    setRepoBusy(true);
    try {
      const target = await ensureProject();
      applyProject(await updateProject(target.projectId, { repositoryUrl: val }));
      setRepoEditing(false);
    } catch (e) {
      setProjectError(projectErrorMessage(e));
    } finally {
      setRepoBusy(false);
    }
  }
  function editGithub() {
    setRepoInput(project?.repositoryUrl ?? "");
    setRepoError(false);
    setRepoEditing(true);
  }
  function openGithub() {
    if (project?.repositoryUrl) window.open(project.repositoryUrl, "_blank");
  }

  /* Derived flags */
  const videoDone = Boolean(project?.videoUrl);
  const githubDone = Boolean(project?.repositoryUrl) && !repoEditing;
  const projectJudged = project?.status === "under_review" || project?.status === "judged";
  // The active conversation (if any) and whether it is a group — drives the
  // image-aware topbar icon and the "click name → group settings" affordance.
  const activeConvo = dmConvos.find((c) => c.conversationId === activeConvoId);
  const activeIsGroup = !!activeConvo && isGroupConvo(activeConvo);

  /* The active hackathon's server (from /me/active-hackathon) gets a "live"
     marker among the inline tabs. Active servers show directly; past ones
     are tucked into the clock dropdown. */
  const activeHackServerId = activeHackathon?.serverId ?? null;
  const activeServers = servers.filter((s) => s.serverId === activeHackServerId);
  const pastServers = servers.filter((s) => s.serverId !== activeHackServerId);
  const dmUnreadTotal = dmConvos.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  /* A single member row in the right-hand participants panel. `online` toggles
   * the presence dot + dimming; behavior (mini-profile click, right-click menu)
   * is identical across the Moderators / Online / Offline sections. */
  const renderMemberRow = (m: ServerMember, online: boolean) => (
    <div
      className="member-row"
      key={m.userId}
      role="button"
      tabIndex={0}
      style={online ? { cursor: "pointer" } : { cursor: "pointer", opacity: 0.6 }}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setMiniProfile({ member: m, anchorTop: r.top, anchorLeft: r.left });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openProfileMenu({ userId: m.userId, username: m.username }, e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setMiniProfile({ member: m, anchorTop: r.top, anchorLeft: r.left });
      }}
    >
      <div className="member-av is-orb">
        <OrbArt url={m.avatarUrl} seed={m.username} />
        {online && <span className="si si-on"></span>}
      </div>
      <div className="member-info">
        <div className="member-name">
          <span style={usernameEffectStyle(m.usernameEffect)}>
            {personName({ displayName: m.displayName, username: m.username })}
          </span>
          {m.isModerator && <span className="member-mod-badge">{t("srvModeratorBadge")}</span>}
        </div>
        <div className="member-handle">@{m.username}</div>
      </div>
    </div>
  );

  /* Participants split into Moderators (online or not) → Online (non-mods) →
   * Offline (non-mods). All counts are real. */
  const moderatorMembers = members.filter((m) => m.isModerator);
  const onlineNonMods = members.filter((m) => !m.isModerator && onlineUsers.has(m.userId));
  const offlineNonMods = members.filter((m) => !m.isModerator && !onlineUsers.has(m.userId));

  return (
    <MentionClickContext.Provider value={setProfileUsername}>
      <h1 className="sr-only">{t("srHeading")}</h1>

      <div
        className="cohor-app"
        onContextMenu={(e) => {
          // Suppress the native browser menu on empty areas so a missed
          // right-click (aimed at a channel) doesn't break immersion. Text
          // fields keep their native menu (paste/spellcheck); the custom
          // channel/message/member menus open via their own handlers, which
          // run first on the target and still fire.
          const el = e.target as HTMLElement;
          if (el.closest("input, textarea, [contenteditable='true']")) return;
          e.preventDefault();
        }}
      >
        {/* TOP COMMAND BAR */}
        <header className="cohor-topbar">
          {/* Left zone — spans the server rail + channel sidebar so the "back to
              feed" brand caps those columns and the active hackathon lines up with
              the current-channel header above the chat. */}
          <div className="cohor-topbar-left">
            <Link
              className="cohor-brand"
              href="/"
              aria-label={t("backHomeAria")}
              title={t("backToFeed")}
            >
              <Icon name="arrow-left" className="cohor-brand-back ic-sm" />
              <span className="cohor-brand-name">
                <b>tiki</b>miki
              </span>
            </Link>
          </div>

          {/* Active hackathon(s) inline — only the currently-active server
              is shown here; past servers live in the clock dropdown. */}
          <nav className="cohor-tabs" aria-label={t("navSwitchAria")}>
            {activeServers.length === 0 && (
              <span className="cohor-tabs-empty">{t("navNoServers")}</span>
            )}
            {activeServers.map((s) => {
              const isCurrent = appMode === "server" && activeServerId === s.serverId;
              return (
                <button
                  key={s.serverId}
                  type="button"
                  className={"cohor-tab" + (isCurrent ? " is-current" : "")}
                  onClick={() => switchServer(s)}
                  title={s.name}
                  aria-current={isCurrent || undefined}
                >
                  <span className="cohor-tab-ic">{serverInitials(s.name)}</span>
                  <span className="cohor-tab-name">{s.name}</span>
                  <span className="cohor-tab-live" aria-hidden="true" title={t("navActiveHacks")} />
                </button>
              );
            })}
          </nav>

          <div className="cohor-topact">
            <button
              type="button"
              className={"cohor-topbtn" + (appMode === "dm" ? " is-on" : "")}
              onClick={enterDmMode}
              aria-label={t("dmAria")}
            >
              <Icon name="messages" className="ic-sm" />
              <span className="cohor-topbtn-label">{t("dmTooltip")}</span>
              {dmUnreadTotal > 0 && <span className="cohor-topbtn-badge">{dmUnreadTotal}</span>}
            </button>
            {pastServers.length > 0 && (
              <div className="cohor-pasthacks" ref={pastHacksRef}>
                <button
                  type="button"
                  className={"cohor-topbtn cohor-topbtn-icon" + (showPastHacks ? " is-on" : "")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPastHacks((v) => !v);
                  }}
                  aria-label={t("navPastHacks")}
                  title={t("navPastHacks")}
                  aria-expanded={showPastHacks}
                >
                  <Icon name="clock" className="ic-sm" />
                </button>
                {showPastHacks && (
                  <div className="cohor-pasthacks-menu" role="menu">
                    <div className="cohor-pasthacks-header">{t("navPastHacks")}</div>
                    {pastServers.map((s) => {
                      const isCurrent = appMode === "server" && activeServerId === s.serverId;
                      return (
                        <button
                          key={s.serverId}
                          type="button"
                          role="menuitem"
                          className={"cohor-pasthacks-item" + (isCurrent ? " is-current" : "")}
                          onClick={() => {
                            switchServer(s);
                            setShowPastHacks(false);
                          }}
                        >
                          <span className="cohor-tab-ic">{serverInitials(s.name)}</span>
                          <span>{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="cohor-body">
          {/* SERVER: CHANNEL SIDEBAR */}
          <div
            className={"ch-sidebar" + (appMode !== "server" ? " dm-hidden" : "")}
            id="panel-ch-sidebar"
          >
            <div className="ch-sidebar-header">
              <div className="ch-sidebar-title">
                <span className="ch-sidebar-title-name">
                  {servers.find((s) => s.serverId === activeServerId)?.name ??
                    hackathon?.title ??
                    ""}
                </span>
                {(can("manage_server") || can("manage_roles") || can("kick_members")) && (
                  <button
                    type="button"
                    className="ch-settings-btn"
                    aria-label={t("srvSettings")}
                    title={t("srvSettings")}
                    onClick={openServerSettings}
                  >
                    <Icon name="settings" className="ic-sm" />
                  </button>
                )}
              </div>
              <div className="ch-admin-btns">
                {/* "Edit hackathon" and "Moderators" placeholder buttons removed:
                  they only fired alert() with no backing API. Server settings
                  (gear, above) now covers roles/members; content reports stays. */}
                <Link
                  className="ch-admin-btn ch-admin-btn-mod"
                  style={{ flexBasis: "100%" }}
                  href="/moderator"
                >
                  <Icon name="flag" className="ic-sm" /> {t("contentReports")}
                </Link>
              </div>
            </div>

            <div className="ch-list">
              {serverGroups.map((group) => (
                <React.Fragment key={group.groupId}>
                  <div className="ch-section ch-section-row">
                    <span className="ch-section-name">{group.name}</span>
                    {can("manage_channels") && (
                      <button
                        type="button"
                        className="ch-section-add"
                        aria-label={t("chAddChannelAria")}
                        title={t("chCreateChannel")}
                        onClick={() => openCreateChannel(group.groupId)}
                      >
                        <Icon name="plus" className="ic-sm" />
                      </button>
                    )}
                  </div>
                  {group.channels.map((ch) => {
                    const cid = ch.channelId;
                    const unread = channelUnread[cid] ?? 0;
                    const isActive = activeChannel === ch.name;
                    const isRezultati = ch.name === "rezultati";
                    const isLocked = isRezultati && isHackathonActive;
                    const muted = mutedChannels.has(cid);
                    const iconKind = channelIconKind(ch.type);
                    return (
                      <button
                        key={cid}
                        className={
                          "ch-item" +
                          (isActive ? " ch-active" : "") +
                          (isLocked ? " ch-locked" : "") +
                          ((!readChannels[ch.name] || unread > 0) && !isActive && !muted
                            ? " ch-unread"
                            : "")
                        }
                        type="button"
                        style={muted ? { opacity: 0.5 } : undefined}
                        onClick={() => switchChannel(ch.name, "", ch.type)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setChCtxConfirmDelete(false);
                          setChCtx({
                            x: e.clientX,
                            y: e.clientY,
                            channelId: cid,
                            name: ch.name,
                            type: ch.type,
                          });
                        }}
                      >
                        {"hash" in iconKind ? (
                          <span className="ch-icon ch-hash">#</span>
                        ) : (
                          <span className="ch-icon ch-type-ic">
                            <Icon name={iconKind.icon} className="ic-sm" />
                          </span>
                        )}
                        <span className="ch-name">{ch.name}</span>
                        {isRezultati && isHackathonActive ? (
                          <span
                            className="ch-locked-icon"
                            id="ch-rezultati-lock"
                            title={t("rezLockedTitleHint")}
                          >
                            <Icon name="lock" className="ic-sm" />
                          </span>
                        ) : isRezultati && rezultatiBadge ? (
                          <span className="ch-badge">{rezultatiBadge}</span>
                        ) : unread > 0 ? (
                          <span className="ch-badge">{unread > 99 ? "99+" : unread}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
              {can("manage_channels") && (
                <button
                  type="button"
                  className="ch-create-group"
                  onClick={() => {
                    setGrpCreateName("");
                    setGrpCreateOpen(true);
                  }}
                >
                  <Icon name="plus" className="ic-sm" /> {t("chCreateGroup")}
                </button>
              )}
            </div>

            <UserStrip
              onOpenProfile={() => user && setProfileUsername(user.username)}
              onContextMenu={(e) => {
                if (!user) return;
                e.preventDefault();
                e.stopPropagation();
                openProfileMenu(
                  { userId: user.userId, username: user.username },
                  e.clientX,
                  e.clientY,
                );
              }}
            />
          </div>

          {/* DM: CONTACT SIDEBAR */}
          <div
            className={"dm-sidebar" + (appMode === "dm" ? " dm-visible" : "")}
            id="panel-dm-sidebar"
          >
            <div className="dm-sidebar-header">
              <div className="dm-sidebar-title">{t("dmSidebarTitle")}</div>
              <div className="dm-action-btns">
                {/* "New message" placeholder removed: no 1:1 DM-start picker exists
                  yet. The working "Group" action (opens the group-create modal)
                  is kept. Flagged for backend/UX follow-up. */}
                <button
                  className="dm-action-btn dm-action-btn-group"
                  type="button"
                  onClick={() => {
                    setGroupPick([]);
                    setShowGroupModal(true);
                  }}
                >
                  <Icon name="teams" className="ic-sm" /> {t("group")}
                </button>
              </div>
              <div className="dm-search-wrap">
                <Icon name="search" className="ic-sm dm-search-ic" />
                <input
                  className="dm-search"
                  type="text"
                  aria-label={t("findOrStart")}
                  placeholder={t("findOrStart")}
                />
              </div>
            </div>

            <div className="dm-list">
              <div className="dm-section">{t("dmSecConversations")}</div>

              {dmConvos.length === 0 && (
                <div className="dm-row" style={{ opacity: 0.6 }}>
                  <div className="dm-row-info">
                    <div className="dm-row-preview">
                      {locale === "sr" ? "Još nema konverzacija." : "No conversations yet."}
                    </div>
                  </div>
                </div>
              )}

              {dmConvos.map((c) => {
                const group = isGroupConvo(c);
                const nm = convoTitle(c);
                return (
                  <button
                    key={c.conversationId}
                    className={
                      "dm-row" + (activeConvoId === c.conversationId ? " dm-row-active" : "")
                    }
                    type="button"
                    onClick={() => openConvo(c.conversationId)}
                  >
                    <div className={"dm-row-av is-orb" + (group ? " dm-row-av-group" : "")}>
                      {group ? (
                        isImageIcon(c.icon) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="orb-art" src={c.icon} alt={nm} />
                        ) : (
                          <span className="dm-row-grp-ic" aria-hidden="true">
                            {c.icon || GROUP_ICON_FALLBACK}
                          </span>
                        )
                      ) : (
                        <OrbArt url={dmOtherAvatarUrl(c)} seed={convoSeed(c)} />
                      )}
                      {c.members.some(
                        (m) => m.userId !== user?.userId && onlineUsers.has(m.userId),
                      ) && <span className="dm-row-si"></span>}
                    </div>
                    <div className="dm-row-info">
                      <div className="dm-row-name">{nm}</div>
                      {c.lastMessage && (
                        <div className="dm-row-preview">{c.lastMessage.content}</div>
                      )}
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="dm-row-unread" aria-label={t("homeUnreadAria")}>
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <UserStrip
              onOpenProfile={() => user && setProfileUsername(user.username)}
              onContextMenu={(e) => {
                if (!user) return;
                e.preventDefault();
                e.stopPropagation();
                openProfileMenu(
                  { userId: user.userId, username: user.username },
                  e.clientX,
                  e.clientY,
                );
              }}
            />
          </div>

          {/* MAIN COLUMN (chat area) */}
          <main className="chat-area">
            <header className="chat-topbar">
              {/* With no channel/conversation open there is nothing to name —
                render the bar empty instead of the default "#opšte". */}
              {!nothingOpen && (
                <>
                  <span className="chat-topbar-icon" id="topbar-icon">
                    {isImageIcon(topbarIcon) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="chat-topbar-img" src={topbarIcon} alt={topbarName} />
                    ) : (
                      topbarIcon
                    )}
                  </span>
                  {activeIsGroup ? (
                    <button
                      type="button"
                      className="chat-topbar-name chat-topbar-name-link"
                      id="topbar-name"
                      onClick={openGroupSettings}
                    >
                      {topbarName}
                    </button>
                  ) : (
                    <span className="chat-topbar-name" id="topbar-name">
                      {topbarName}
                    </span>
                  )}
                  {topbarDesc && (
                    <>
                      <span className="chat-topbar-dot" aria-hidden="true"></span>
                      <span className="chat-topbar-desc" id="topbar-desc">
                        {topbarDesc}
                      </span>
                    </>
                  )}
                  <div className="topbar-actions">
                    <button className="topbar-btn" type="button" aria-label={t("searchInChannel")}>
                      <Icon name="search" className="ic-sm" />
                    </button>
                    <button className="topbar-btn" type="button" aria-label={t("pinnedMessages")}>
                      <Icon name="flag" className="ic-sm" />
                    </button>
                    <button
                      className="topbar-btn"
                      type="button"
                      id="topbar-toggle-right"
                      onClick={toggleRightPanel}
                      aria-label={t("toggleParticipants")}
                    >
                      <Icon name="teams" className="ic-sm" />
                    </button>
                  </div>
                </>
              )}
            </header>

            {/* Server messages */}
            <div
              className={
                "messages" + (appMode !== "server" || panel !== "messages" ? " dm-hidden" : "")
              }
              id="messages-server"
              ref={serverMsgsRef}
              style={appMode !== "server" || panel !== "messages" ? { display: "none" } : undefined}
            >
              {servers.length === 0 ? (
                /* blank while the list loads; the empty state only once we KNOW */
                serversLoaded ? (
                  <div className="ch-no-access">
                    <div className="ch-no-access-icon">#</div>
                    <div className="ch-no-access-title">{t("noServerAccessTitle")}</div>
                    <div className="ch-no-access-sub">{t("noServerAccessSub")}</div>
                  </div>
                ) : null
              ) : (
                <>
                  <div style={{ flex: 1 }}></div>
                  <div className="ch-intro">
                    <div className="ch-intro-hash">#</div>
                    <div className="ch-intro-title">
                      {t("chIntroTitlePre")}
                      {activeChannel}
                    </div>
                    <div className="ch-intro-sub">
                      {t("chIntroSubPre")}
                      <strong style={{ color: "var(--violet-light)" }}>#{activeChannel}</strong>
                      {t("chIntroSubPost")}
                    </div>
                  </div>
                  {activeChannelId && (
                    <>
                      {chatLoading && (
                        <div className="msg-date-sep">
                          {locale === "sr" ? "Učitavanje…" : "Loading…"}
                        </div>
                      )}
                      {!chatLoading && msgs.length === 0 && (
                        <div className="msg-date-sep">
                          {locale === "sr" ? "Još nema poruka" : "No messages yet"}
                        </div>
                      )}
                      {msgs.map((m) => (
                        <div
                          className={
                            m.senderId !== user?.userId &&
                            isUserMentioned(m.content, user?.username)
                              ? "msg msg-mentioned"
                              : "msg"
                          }
                          key={m.messageId}
                          style={{ marginTop: 10 }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setCtxConfirmDelete(false);
                            setCtxReactOpen(false);
                            setCtxMenu({ x: e.clientX, y: e.clientY, m });
                          }}
                        >
                          <div className="msg-av is-orb">
                            <OrbArt url={m.senderAvatarUrl} seed={m.senderUsername} />
                          </div>
                          <div className="msg-body">
                            <div className="msg-meta-row">
                              <span
                                className="msg-author msg-author-v"
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const author =
                                    members.find((mm) => mm.userId === m.senderId) ??
                                    members.find((mm) => mm.username === m.senderUsername);
                                  if (author) {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setMiniProfile({
                                      member: author,
                                      anchorTop: r.top,
                                      anchorLeft: r.left,
                                    });
                                  } else {
                                    setProfileUsername(m.senderUsername);
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openProfileMenu(
                                    {
                                      userId: m.senderId,
                                      username: m.senderUsername,
                                    },
                                    e.clientX,
                                    e.clientY,
                                  );
                                }}
                                title={m.senderUsername}
                              >
                                {personName({
                                  displayName: m.senderDisplayName,
                                  username: m.senderUsername,
                                })}
                              </span>
                              {onlineUsers.has(m.senderId) && (
                                <span
                                  title="online"
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background: "var(--green, #4fd8a6)",
                                    display: "inline-block",
                                  }}
                                />
                              )}
                              <span className="msg-time">
                                {new Date(m.sentAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {renderReplyPreview(m, msgs)}
                            {renderForwardPreview(m)}
                            {editingId === m.messageId ? (
                              <input
                                type="text"
                                className="msg-edit-input"
                                value={editDraft}
                                autoFocus
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitEdit(m.messageId);
                                  else if (e.key === "Escape") setEditingId(null);
                                }}
                                style={CTX_EDIT_INPUT_STYLE}
                              />
                            ) : (
                              <div className="msg-text">
                                <MarkdownContent>{parseForwarded(m.content).body}</MarkdownContent>
                                {m.editedAt && (
                                  <span className="msg-edited" style={CTX_EDITED_STYLE}>
                                    {t("ctxEdited")}
                                  </span>
                                )}
                              </div>
                            )}
                            {renderAttachments(m)}
                            {m.reactions && m.reactions.length > 0 && (
                              <div className="msg-reactions" style={{ marginTop: 4 }}>
                                {m.reactions.map((rx) => (
                                  <button
                                    key={rx.symbol}
                                    type="button"
                                    className={"reaction" + (rx.mine ? " mine" : "")}
                                    onClick={() => toggleReactionOn(m.messageId, rx.symbol)}
                                    style={{ cursor: "pointer" }}
                                  >
                                    {rx.symbol} {rx.count}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>

            {/* DM messages */}
            <div
              className={"messages" + (appMode === "dm" ? "" : " dm-hidden")}
              id="messages-dm"
              ref={dmMsgsRef}
              style={appMode === "dm" ? undefined : { display: "none" }}
            >
              {/* Fresh account: no conversations at all — explain the empty
                middle instead of leaving it blank. */}
              {appMode === "dm" && !activeConvoId && dmLoaded && dmConvos.length === 0 && (
                <div className="ch-no-access">
                  <div className="ch-no-access-icon">@</div>
                  <div className="ch-no-access-title">{t("dmEmptyTitle")}</div>
                  <div className="ch-no-access-sub">{t("dmEmptySub")}</div>
                </div>
              )}
              {appMode === "dm" && activeConvoId && (
                <>
                  <div style={{ flex: 1 }}></div>
                  {dmRealMsgs.length === 0 && (
                    <div className="msg-date-sep">
                      {locale === "sr" ? "Još nema poruka" : "No messages yet"}
                    </div>
                  )}
                  {dmRealMsgs.map((m) => (
                    <div
                      className={
                        m.senderId !== user?.userId && isUserMentioned(m.content, user?.username)
                          ? "msg msg-mentioned"
                          : "msg"
                      }
                      key={m.messageId}
                      style={{ marginTop: 10 }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCtxConfirmDelete(false);
                        setCtxReactOpen(false);
                        setCtxMenu({ x: e.clientX, y: e.clientY, m });
                      }}
                    >
                      <div
                        className="msg-av is-orb"
                        style={{ cursor: "pointer" }}
                        onClick={() => setProfileUsername(m.senderUsername)}
                      >
                        <OrbArt url={m.senderAvatarUrl} seed={m.senderUsername} />
                      </div>
                      <div className="msg-body">
                        <div className="msg-meta-row">
                          <span
                            className="msg-author msg-author-v"
                            style={{ cursor: "pointer" }}
                            onClick={() => setProfileUsername(m.senderUsername)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openProfileMenu(
                                {
                                  userId: m.senderId,
                                  username: m.senderUsername,
                                },
                                e.clientX,
                                e.clientY,
                              );
                            }}
                            title={m.senderUsername}
                          >
                            {personName({
                              displayName: m.senderDisplayName,
                              username: m.senderUsername,
                            })}
                          </span>
                          <span className="msg-time">
                            {new Date(m.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {renderReplyPreview(m, dmRealMsgs)}
                        {renderForwardPreview(m)}
                        {editingId === m.messageId ? (
                          <input
                            type="text"
                            className="msg-edit-input"
                            value={editDraft}
                            autoFocus
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(m.messageId);
                              else if (e.key === "Escape") setEditingId(null);
                            }}
                            style={CTX_EDIT_INPUT_STYLE}
                          />
                        ) : (
                          <div className="msg-text">
                            <MarkdownContent>{parseForwarded(m.content).body}</MarkdownContent>
                            {m.editedAt && (
                              <span className="msg-edited" style={CTX_EDITED_STYLE}>
                                {t("ctxEdited")}
                              </span>
                            )}
                          </div>
                        )}
                        {renderAttachments(m)}
                        {m.reactions && m.reactions.length > 0 && (
                          <div className="msg-reactions" style={{ marginTop: 4 }}>
                            {m.reactions.map((rx) => (
                              <button
                                key={rx.symbol}
                                type="button"
                                className={"reaction" + (rx.mine ? " mine" : "")}
                                onClick={() => toggleReactionOn(m.messageId, rx.symbol)}
                                style={{ cursor: "pointer" }}
                              >
                                {rx.symbol} {rx.count}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
              {appMode === "dm" && !activeConvoId && activeDm && (
                <DmStream entry={DM[activeDm]} extra={dmExtra[activeDm] || []} />
              )}
            </div>

            {/* PREDAJA PROJEKTA PANEL */}
            <div
              id="predaja-panel"
              className="swap-panel"
              style={{ display: panel === "predaja" ? "flex" : "none" }}
            >
              <div className="panel-pad-top">
                <div className="panel-org-row">
                  <div className="panel-org-av panel-org-av-green is-orb">
                    <GenerativeAvatar seed="mohammedavdol" className="orb-art" />
                  </div>
                  <div>
                    <span className="panel-org-name panel-org-name-green">Mohammed Avdol</span>
                    <span className="role-badge role-badge-org">{t("roleBadgeOrg")}</span>
                    <div className="panel-org-time">11. april 2026. u 09:00</div>
                  </div>
                </div>
                <div className="panel-brief">
                  <div className="panel-brief-head">
                    <Icon name="share" className="ic-sm" />
                    <span className="panel-brief-title">{t("predajaBriefTitle")}</span>
                  </div>
                  <div className="panel-brief-text">{t("predajaBriefText")}</div>
                  <div className="panel-spec-grid">
                    <div className="panel-spec">
                      <div className="panel-spec-label">{t("specDuration")}</div>
                      <div className="panel-spec-val">{t("specDurationVal")}</div>
                    </div>
                    <div className="panel-spec">
                      <div className="panel-spec-label">{t("specMaxSize")}</div>
                      <div className="panel-spec-val">500 MB</div>
                    </div>
                    <div className="panel-spec">
                      <div className="panel-spec-label">{t("specFormats")}</div>
                      <div className="panel-spec-val">MP4, MOV, AVI</div>
                    </div>
                    <div className="panel-spec">
                      <div className="panel-spec-label">{t("specDeadline")}</div>
                      <div className="panel-spec-val panel-spec-val-lemon">
                        {t("specDeadlineVal")}
                      </div>
                    </div>
                  </div>
                  <div className="panel-brief-note">
                    {t("predajaNotePre")}
                    <strong>{t("predajaNoteStrong")}</strong>
                    {t("predajaNotePost")}
                  </div>
                </div>
              </div>

              {!myTeamId ? (
                <div className="panel-section">
                  <div className="panel-brief-note">{t("predajaNoTeam")}</div>
                </div>
              ) : projectLoading ? (
                <div className="panel-section">
                  <div className="panel-brief-note">{t("predajaLoading")}</div>
                </div>
              ) : (
                <>
                  {projectError && (
                    <div className="panel-section">
                      <div id="video-upload-err" className="video-upload-err">
                        ⚠ {projectError}
                      </div>
                    </div>
                  )}
                  {/* Video section */}
                  <div className="panel-section">
                    {!videoDone ? (
                      <div id="video-empty-state">
                        <div className="panel-label">{t("videoLabel")}</div>
                        <div
                          id="video-drop-zone"
                          className={
                            "video-drop-zone" +
                            (dragOver ? " drag-over" : "") +
                            (videoError ? " error" : "")
                          }
                          onClick={() => !uploadingVideo && videoFileInputRef.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                          }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const f = e.dataTransfer.files[0];
                            if (f) processVideoFile(f);
                          }}
                        >
                          <div className="video-drop-ic">
                            <Icon name="image" className="ic-lg" />
                          </div>
                          <div className="video-drop-title">
                            {uploadingVideo ? t("videoUploading") : t("videoDropTitle")}
                          </div>
                          <div className="video-drop-sub">{t("videoDropSub")}</div>
                          <div className="video-drop-btn">
                            <Icon name="share" className="ic-sm" /> {t("videoUpload")}
                          </div>
                          <input
                            type="file"
                            id="video-file-input"
                            ref={videoFileInputRef}
                            accept="video/mp4,video/quicktime,video/avi,video/*"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) processVideoFile(f);
                            }}
                          />
                        </div>
                        {videoError && (
                          <div id="video-upload-err" className="video-upload-err">
                            ⚠ {videoError}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div id="video-uploaded-state">
                        <div className="panel-label-row">
                          <div className="panel-label">{t("videoLabel")}</div>
                          {!projectJudged && (
                            <div className="panel-label-actions">
                              <button
                                type="button"
                                className="mini-btn"
                                disabled={uploadingVideo}
                                onClick={() => videoReplaceInputRef.current?.click()}
                              >
                                <Icon name="share" className="ic-sm" /> {t("videoReplace")}
                              </button>
                              <input
                                type="file"
                                id="video-replace-input"
                                ref={videoReplaceInputRef}
                                accept="video/*"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) processVideoFile(f);
                                }}
                              />
                              <button
                                type="button"
                                className="mini-btn mini-btn-danger"
                                disabled={uploadingVideo}
                                onClick={removeVideo}
                              >
                                <Icon name="x" className="ic-sm" /> {t("videoRemove")}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="video-frame">
                          <video
                            id="video-player"
                            src={project?.videoUrl ?? undefined}
                            controls
                            preload="metadata"
                            style={{
                              width: "100%",
                              display: "block",
                              maxHeight: 340,
                              background: "#000",
                            }}
                          >
                            {t("videoNoHtml5")}
                          </video>
                        </div>
                        {videoError && (
                          <div id="video-upload-err" className="video-upload-err">
                            ⚠ {videoError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* GitHub repo section */}
                  <div className="panel-section">
                    <div className="panel-label">{t("githubLabel")}</div>
                    <div
                      id="github-display"
                      className="github-display"
                      style={{ display: githubDone ? "flex" : "none" }}
                    >
                      <span className="github-display-ic">
                        <Icon name="link" className="ic-sm" />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          id="github-link-display"
                          className="github-link-display"
                          onClick={openGithub}
                        >
                          {(project?.repositoryUrl ?? "").replace("https://", "")}
                        </div>
                      </div>
                      {!projectJudged && (
                        <button type="button" className="mini-btn" onClick={editGithub}>
                          {t("edit")}
                        </button>
                      )}
                    </div>
                    {!projectJudged && (
                      <div
                        id="github-input-wrap"
                        className="github-input-wrap"
                        style={{ display: githubDone ? "none" : "flex" }}
                      >
                        <div
                          className={"github-input-box" + (repoFocused ? " focused" : "")}
                          id="github-input-box"
                        >
                          <span className="github-input-ic">
                            <Icon name="link" className="ic-sm" />
                          </span>
                          <input
                            type="text"
                            id="github-url-input"
                            aria-label="Repository URL"
                            placeholder="https://github.com/tim/repo"
                            value={repoInput}
                            onChange={(e) => setRepoInput(e.target.value)}
                            onFocus={() => setRepoFocused(true)}
                            onBlur={() => setRepoFocused(false)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveGithub();
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-violet-sm"
                          onClick={saveGithub}
                          disabled={repoBusy}
                        >
                          {t("save")}
                        </button>
                      </div>
                    )}
                    <div
                      id="github-error"
                      className="github-error"
                      style={{ display: repoError ? "flex" : "none" }}
                    >
                      <Icon name="x" className="ic-sm" /> {t("githubError")}
                    </div>
                  </div>

                  {/* Status summary */}
                  <div className="panel-section panel-section-end">
                    <div className="panel-label">{t("statusTitle")}</div>
                    <div className="status-card">
                      <div className="status-row">
                        <span
                          id="status-video-icon"
                          className={"status-ic" + (videoDone ? " status-ic-done" : "")}
                        >
                          <Icon name={videoDone ? "check" : "x"} className="ic-sm" />
                        </span>
                        <div style={{ flex: 1 }}>
                          <div className="status-name">{t("statusVideoName")}</div>
                          <div id="status-video-txt" className="status-sub">
                            {videoDone ? t("statusUploaded") : t("statusNotUploaded")}
                          </div>
                        </div>
                      </div>
                      <div className="status-row">
                        <span
                          id="status-github-icon"
                          className={"status-ic" + (githubDone ? " status-ic-done" : "")}
                        >
                          <Icon name={githubDone ? "check" : "x"} className="ic-sm" />
                        </span>
                        <div style={{ flex: 1 }}>
                          <div className="status-name">{t("statusGithubName")}</div>
                          <div id="status-github-txt" className="status-sub">
                            {githubDone ? t("statusLinkAdded") : t("statusLinkNotAdded")}
                          </div>
                        </div>
                      </div>
                      {project && (
                        <div className="status-row">
                          <span
                            className={
                              "status-ic" + (project.status !== "draft" ? " status-ic-done" : "")
                            }
                          >
                            <Icon
                              name={project.status !== "draft" ? "check" : "x"}
                              className="ic-sm"
                            />
                          </span>
                          <div style={{ flex: 1 }}>
                            <div className="status-name">{t("statusSubmissionName")}</div>
                            <div className="status-sub">
                              {project.status === "draft" && t("projectStatusDraft")}
                              {project.status === "submitted" && t("projectStatusSubmitted")}
                              {project.status === "under_review" && t("projectStatusReview")}
                              {project.status === "judged" && t("projectStatusJudged")}
                            </div>
                          </div>
                          {project.status === "draft" && (
                            <button
                              type="button"
                              className="btn-violet-sm"
                              onClick={handleSubmitProject}
                              disabled={projectBusy !== null}
                            >
                              {projectBusy === "submit"
                                ? t("projectSubmitting")
                                : t("projectSubmit")}
                            </button>
                          )}
                          {project.status === "submitted" && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={handleWithdrawProject}
                              disabled={projectBusy !== null}
                            >
                              {projectBusy === "withdraw"
                                ? t("projectWithdrawing")
                                : t("projectWithdraw")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* BOUNTIES PANEL */}
            <div
              id="bounties-panel"
              className="swap-panel"
              style={{ display: panel === "bounties" ? "flex" : "none" }}
            >
              <div className="panel-pad-top">
                <div className="panel-org-row">
                  <div className="panel-org-av panel-org-av-lemon">
                    <Icon name="coin" className="ic-sm" />
                  </div>
                  <div>
                    <div className="panel-org-name panel-org-name-lemon">
                      {t("bountyOrgName")}{" "}
                      <span className="panel-org-meta">· ETF HackWeek 2026</span>
                    </div>
                    <div className="panel-org-time">{t("bountyOrgDesc")}</div>
                  </div>
                </div>

                <div className="info-banner info-banner-lemon">
                  <Icon name="coin" className="ic-sm" />
                  <span>
                    {t("bountyBannerPre")}
                    <strong>{t("bountyBannerStrong")}</strong>
                    {t("bountyBannerPost")}
                  </span>
                </div>

                {/* Real sponsor bounties for the active hackathon */}
                {bounties.length > 0 ? (
                  bounties.map((b, i) => {
                    const style = BOUNTY_BADGE_STYLES[i % BOUNTY_BADGE_STYLES.length];
                    return (
                      <BountyCard
                        key={b.bountyId}
                        id={b.bountyId}
                        cardStyle={i === bounties.length - 1 ? { marginBottom: 32 } : undefined}
                        badgeStyle={style.badgeStyle}
                        badgeIcon={style.badgeIcon}
                        sponsor={b.sponsorName}
                        prize={b.prizeAward ?? ""}
                        title={b.title}
                        desc={b.description ?? ""}
                        tags={b.theme ? [b.theme] : []}
                        count={b.applicantCount}
                        applied={b.hasApplied}
                        onApply={() => applyBounty(b)}
                      />
                    );
                  })
                ) : (
                  <div className="rezultati-locked" style={{ marginBottom: 32 }}>
                    <div className="rezultati-locked-ic">
                      <Icon name="coin" className="ic-lg" />
                    </div>
                    <div className="rezultati-locked-title">{t("bountyEmptyTitle")}</div>
                    <div className="rezultati-locked-sub">{t("bountyEmptySub")}</div>
                  </div>
                )}
              </div>
            </div>

            {/* GLASANJE PUBLIKE PANEL */}
            <div
              id="glasanje-panel"
              className="swap-panel"
              style={{ display: panel === "glasanje" ? "flex" : "none" }}
            >
              <div className="panel-pad-top">
                <div className="panel-org-row">
                  <div className="panel-org-av panel-org-av-green is-orb">
                    <GenerativeAvatar seed="mohammedavdol" className="orb-art" />
                  </div>
                  <div>
                    <div className="panel-org-name panel-org-name-green">
                      Mohammed Avdol <span className="panel-org-meta">{t("glasanjeOrgMeta")}</span>
                    </div>
                    <div className="panel-org-say">
                      <span className="msg-inline-ic">
                        <Icon name="leaderboard" className="ic-sm" />
                      </span>{" "}
                      {t("glasanjeSayPre")}
                      <strong>{t("glasanjeSayStrong")}</strong>
                      {t("glasanjeSayPost")}
                    </div>
                  </div>
                </div>

                {/* Status baner: glasanje nije aktivno */}
                <div
                  id="voting-locked-banner"
                  className="voting-locked-banner"
                  style={{
                    display: (votingStatus ? votingStatus.isOpen : isVotingOpen) ? "none" : "flex",
                  }}
                >
                  <div className="voting-locked-ic">
                    <Icon name="lock" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="voting-locked-title">{t("votingLockedTitle")}</div>
                    <div className="voting-locked-sub">
                      {t("votingLockedSub")}
                      {votingStatus?.opensAt ? (
                        <>
                          {" "}
                          {t("votingOpensAtLabel")}
                          {new Date(votingStatus.opensAt).toLocaleString()}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div id="voting-countdown-pill" className="voting-countdown-pill">
                    <Icon name="clock" className="ic-sm" />
                    <span id="voting-opens-in">{votingCountdownLabel}</span>
                  </div>
                </div>

                <div className="panel-label">
                  {t("projectsLabelPre")}
                  {realProjects.length > 0 ? realProjects.length : 28}
                  {t("projectsLabelPost")}
                </div>

                <div id="projects-list" className="projects-list">
                  {realProjects.length > 0 ? (
                    realProjects.map((p) => {
                      const initials = p.teamName.slice(0, 2).toUpperCase();
                      const isVoted = myVotedProjectId === p.projectId;
                      return (
                        <div className="project-card" data-project={p.projectId} key={p.projectId}>
                          <div className="project-card-left">
                            <div className="project-av">{initials}</div>
                            <div className="project-info">
                              <div className="project-name">
                                {p.title} <span className="project-team-badge">{p.teamName}</span>
                              </div>
                              <div className="project-desc">{p.description}</div>
                            </div>
                          </div>
                          <div className="project-card-right">
                            <div className="project-votes">
                              <span className="project-votes-num">{p.voteCount}</span>
                              <span className="project-votes-label">{t("votesLabel")}</span>
                            </div>
                            <button
                              className={isVoted ? "vote-btn voted" : "vote-btn"}
                              type="button"
                              disabled={myVotedProjectId !== null || votingStatus?.isOpen === false}
                              onClick={() => voteForProject(p.projectId)}
                            >
                              {isVoted ? t("votedBtn") : t("voteBtn")}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <>
                      <ProjectCard
                        team="digitalci"
                        btnId="vote-btn-digitalci"
                        av="DC"
                        avStyle={{
                          background: "#241750",
                          color: "var(--violet-light)",
                          borderColor: "#3D2E6B",
                        }}
                        name="EduBot"
                        badge="★ digitalci"
                        badgeStyle={{
                          background: "#241750",
                          color: "var(--violet-light)",
                          borderColor: "#3D2E6B",
                        }}
                        desc={t("projEduBotDesc")}
                        tags={["Python", "LLM", "FastAPI"]}
                        votesId="votes-digitalci"
                        votes={votes.digitalci}
                        isVotingOpen={isVotingOpen}
                        myVote={myVote}
                        onVote={castVote}
                      />
                      <ProjectCard
                        team="ukohorisani"
                        btnId="vote-btn-bytecraft"
                        av="UK"
                        avStyle={{
                          background: "#0D1A0D",
                          color: "var(--green)",
                          borderColor: "#0F3D30",
                        }}
                        name="ClassroomOS"
                        badge="ukohorisani"
                        badgeStyle={{
                          background: "#0D1A0D",
                          color: "var(--green)",
                          borderColor: "#0F3D30",
                        }}
                        desc={t("projClassroomOSDesc")}
                        tags={["React", "OpenCV", "WebSocket"]}
                        votesId="votes-bytecraft"
                        votes={votes.ukohorisani}
                        isVotingOpen={isVotingOpen}
                        myVote={myVote}
                        onVote={castVote}
                      />
                      <ProjectCard
                        team="nullptr"
                        btnId="vote-btn-nullptr"
                        av="NP"
                        avStyle={{
                          background: "#1A0D0D",
                          color: "var(--red)",
                          borderColor: "#3D1A1A",
                        }}
                        name="QuizForge"
                        badge="nullptr"
                        badgeStyle={{
                          background: "#1A0D0D",
                          color: "var(--red)",
                          borderColor: "#3D1A1A",
                        }}
                        desc={t("projQuizForgeDesc")}
                        tags={["Next.js", "GPT-4", "PostgreSQL"]}
                        votesId="votes-nullptr"
                        votes={votes.nullptr}
                        isVotingOpen={isVotingOpen}
                        myVote={myVote}
                        onVote={castVote}
                      />
                      <ProjectCard
                        team="lale"
                        btnId="vote-btn-stackframe"
                        av="LA"
                        avStyle={{
                          background: "#1A1500",
                          color: "var(--lemon-vivid)",
                          borderColor: "#3A3600",
                        }}
                        name="MathPath"
                        badge="lale"
                        badgeStyle={{
                          background: "#1A1500",
                          color: "var(--lemon-vivid)",
                          borderColor: "#3A3600",
                        }}
                        desc={t("projMathPathDesc")}
                        tags={["Three.js", "WebGL", "SpeechAPI"]}
                        votesId="votes-stackframe"
                        votes={votes.lale}
                        isVotingOpen={isVotingOpen}
                        myVote={myVote}
                        onVote={castVote}
                      />
                      <ProjectCard
                        team="menjači"
                        btnId="vote-btn-menjači"
                        av="ME"
                        avStyle={{
                          background: "#0D0D1A",
                          color: "var(--violet-light)",
                          borderColor: "#2D1A55",
                        }}
                        name="PeerLearn"
                        badge="menjači"
                        badgeStyle={{
                          background: "#0D0D1A",
                          color: "var(--violet-light)",
                          borderColor: "#2D1A55",
                        }}
                        desc={t("projPeerLearnDesc")}
                        tags={["Vue.js", "Node", "ML"]}
                        votesId="votes-menjači"
                        votes={votes.menjači}
                        isVotingOpen={isVotingOpen}
                        myVote={myVote}
                        onVote={castVote}
                      />

                      <MoreProjectsStub />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* REZULTATI PANEL */}
            <div
              id="rezultati-panel"
              className="swap-panel"
              style={{ display: panel === "rezultati" ? "flex" : "none" }}
            >
              {/* Locked state (while hackathon is active and nothing published) */}
              <div
                id="rezultati-locked"
                className="rezultati-locked"
                style={{ display: isHackathonActive && !results?.published ? "" : "none" }}
              >
                <div className="rezultati-locked-ic">
                  <Icon name="lock" className="ic-lg" />
                </div>
                <div className="rezultati-locked-title">{t("rezLockedTitle")}</div>
                <div className="rezultati-locked-sub">{t("rezLockedSub")}</div>
                <div id="rezultati-locked-pill" className="rezultati-locked-pill">
                  <span className="rezultati-locked-dot"></span>
                  <span id="rezultati-locked-countdown">{rezultatiLockedCountdown}</span>
                </div>
              </div>

              {/* Unlocked: org form + published view */}
              <div
                id="rezultati-unlocked"
                className="rezultati-unlocked"
                style={{ display: !isHackathonActive || results?.published ? "flex" : "none" }}
              >
                <div className="panel-pad-top">
                  <div className="panel-org-row">
                    <div className="panel-org-av panel-org-av-green is-orb">
                      <GenerativeAvatar seed="mohammedavdol" className="orb-art" />
                    </div>
                    <div>
                      <span className="panel-org-name panel-org-name-green">Mohammed Avdol</span>
                      <span className="role-badge role-badge-org">{t("roleBadgeOrg")}</span>
                      <div className="panel-org-time" id="rezultati-header-time">
                        {t("rezHeaderTime")}
                      </div>
                    </div>
                  </div>
                  <div className="panel-brief panel-brief-flat">
                    <span className="msg-inline-ic">
                      <Icon name="trophy" className="ic-sm" />
                    </span>{" "}
                    {t("rezBriefPre")}
                    <strong>{t("rezBriefStrong")}</strong>
                    {t("rezBriefPost")}
                  </div>
                </div>

                {/* FORM: enter results (org only) */}
                <div
                  id="rezultati-form-wrap"
                  className="rezultati-form-wrap"
                  style={{ display: rezPublished || results?.published ? "none" : "block" }}
                >
                  <div className="panel-label">{t("rezFormLabel")}</div>

                  {/* Plasman */}
                  <div className="rez-group">
                    <div className="rez-group-head">{t("rezGroupRanking")}</div>

                    <div className="rez-row">
                      <div className="rez-medal rez-medal-1">
                        <Icon name="trophy" className="ic-sm" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="rez-row-label">{t("rezPlace1")}</div>
                        <RezSelect
                          id="rank1-select"
                          ariaLabel={t("rezPlace1")}
                          value={rezForm.rank1}
                          onChange={(v) => onRankChange("rank1", v)}
                        />
                      </div>
                      <div id="rank1-badge" className="rez-badge rez-badge-1">
                        {t("rezBadge1")}
                      </div>
                    </div>

                    <div className="rez-row">
                      <div className="rez-medal rez-medal-2">
                        <Icon name="trophy" className="ic-sm" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="rez-row-label">{t("rezPlace2")}</div>
                        <RezSelect
                          id="rank2-select"
                          ariaLabel={t("rezPlace2")}
                          value={rezForm.rank2}
                          onChange={(v) => onRankChange("rank2", v)}
                        />
                      </div>
                      <div id="rank2-badge" className="rez-badge rez-badge-2">
                        {t("rezBadge2")}
                      </div>
                    </div>

                    <div className="rez-row rez-row-last">
                      <div className="rez-medal rez-medal-3">
                        <Icon name="trophy" className="ic-sm" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="rez-row-label">{t("rezPlace3")}</div>
                        <RezSelect
                          id="rank3-select"
                          ariaLabel={t("rezPlace3")}
                          value={rezForm.rank3}
                          onChange={(v) => onRankChange("rank3", v)}
                        />
                      </div>
                      <div id="rank3-badge" className="rez-badge rez-badge-3">
                        {t("rezBadge3")}
                      </div>
                    </div>
                  </div>

                  {/* Nagrada publike */}
                  <div className="rez-group">
                    <div className="rez-group-head">{t("rezGroupAudience")}</div>
                    <div className="rez-row rez-row-last">
                      <div className="rez-medal rez-medal-pub">
                        <Icon name="leaderboard" className="ic-sm" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="rez-row-label">{t("rezAudienceRowLabel")}</div>
                        <RezSelect
                          id="publike-select"
                          ariaLabel={t("rezAudienceLabel")}
                          value={rezForm.publike}
                          onChange={(v) => onRankChange("publike", v)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sponzorske nagrade — driven by the real bounties list */}
                  {bounties.length > 0 && (
                    <div className="rez-group">
                      <div className="rez-group-head">{t("rezGroupSponsor")}</div>

                      {bounties.map((b, i) => {
                        const style = BOUNTY_BADGE_STYLES[i % BOUNTY_BADGE_STYLES.length];
                        const last = i === bounties.length - 1;
                        return (
                          <div
                            className={"rez-row" + (last ? " rez-row-last" : "")}
                            key={b.bountyId}
                          >
                            <div className="rez-medal" style={style.badgeStyle}>
                              <Icon name={style.badgeIcon} className="ic-sm" />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div
                                className="rez-spon-name"
                                style={{ color: style.badgeStyle.color }}
                              >
                                {b.sponsorName} — {b.title}
                              </div>
                              {b.theme && <div className="rez-spon-sub">{b.theme}</div>}
                              <RezSelect
                                id={`bounty-${b.bountyId}-select`}
                                ariaLabel={`${b.sponsorName} — ${b.title}`}
                                placeholder={t("selectWinner")}
                                value={bountyWinners[b.bountyId] ?? ""}
                                onChange={(v) =>
                                  setBountyWinners((prev) => ({
                                    ...prev,
                                    [b.bountyId]: v,
                                  }))
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Error */}
                  <div
                    id="rezultati-form-error"
                    className="rez-form-error"
                    style={{ display: rezError ? "flex" : "none" }}
                  >
                    <Icon name="x" className="ic-sm" />{" "}
                    <span id="rezultati-form-error-msg">{rezError ?? t("rezErrFallback")}</span>
                  </div>

                  {/* Submit button */}
                  <button
                    id="rezultati-submit-btn"
                    type="button"
                    className="rez-submit-btn"
                    onClick={submitRezultati}
                  >
                    {rezSaved ? t("rezUpdate") : t("rezSubmit")}
                  </button>
                </div>

                {/* PUBLISHED VIEW */}
                <div
                  id="rezultati-published"
                  className="rezultati-published"
                  style={{ display: rezPublished || results?.published ? "block" : "none" }}
                >
                  <div className="panel-label-row">
                    <div className="panel-label">{t("rezOfficial")}</div>
                    {!results?.published && (
                      <button
                        id="rezultati-edit-btn"
                        type="button"
                        className="mini-btn"
                        onClick={editRezultati}
                      >
                        <Icon name="settings" className="ic-sm" /> {t("rezEditResults")}
                      </button>
                    )}
                  </div>

                  {/* Real published podium (backend) */}
                  {results?.published && (
                    <>
                      <div className="rez-podium">
                        {[...results.podium]
                          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
                          .map((p) => {
                            const cls =
                              p.rank === 1
                                ? "rez-podium-1"
                                : p.rank === 2
                                  ? "rez-podium-2"
                                  : p.rank === 3
                                    ? "rez-podium-3"
                                    : "rez-podium-pub";
                            const subKey =
                              p.rank === 1
                                ? "rezPodium1Sub"
                                : p.rank === 2
                                  ? "rezPodium2Sub"
                                  : p.rank === 3
                                    ? "rezPodium3Sub"
                                    : "rezPodiumPubSub";
                            return (
                              <div className={"rez-podium-row " + cls} key={p.projectId}>
                                <div className="rez-podium-medal">
                                  <Icon name={p.rank ? "trophy" : "leaderboard"} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div className="rez-podium-name">{p.teamName}</div>
                                  <div className="rez-podium-sub">
                                    {t(subKey as keyof typeof M)}
                                    {p.title ? ` · ${p.title}` : ""}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {results.bountyWinners.length > 0 && (
                        <div className="rez-spon-published">
                          <div className="rez-spon-published-head">{t("rezSponPublishedHead")}</div>
                          {results.bountyWinners.map((w, i) => {
                            const style = BOUNTY_BADGE_STYLES[i % BOUNTY_BADGE_STYLES.length];
                            const last = i === results.bountyWinners.length - 1;
                            return (
                              <div
                                className={"rez-spon-row" + (last ? " rez-spon-row-last" : "")}
                                key={w.bountyId}
                                style={{ "--accent": style.badgeStyle.color } as CSSProperties}
                              >
                                <div className="rez-spon-row-ic" style={style.badgeStyle}>
                                  <Icon name={style.badgeIcon} className="ic-sm" />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div
                                    className="rez-spon-row-name"
                                    style={{ color: style.badgeStyle.color }}
                                  >
                                    {w.teamName}
                                  </div>
                                  <div className="rez-spon-row-sub">
                                    {w.sponsorName} · {w.bountyTitle}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="rez-published-info">
                        <span className="rez-published-info-ic">
                          <Icon name="check" className="ic-sm" />
                        </span>
                        <div>
                          <div className="rez-published-info-title">{t("rezPublishedTitle")}</div>
                          <div className="rez-published-info-sub">{t("rezTimestampDefault")}</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Podium (fallback) */}
                  {!results?.published && (
                    <>
                      <div id="rezultati-podium" className="rez-podium">
                        <div className="rez-podium-row rez-podium-1">
                          <div className="rez-podium-medal">
                            <Icon name="trophy" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="rez-podium-name" id="pub-rank1-name">
                              {rezPublished?.rank1 || "—"}
                            </div>
                            <div className="rez-podium-sub">{t("rezPodium1Sub")}</div>
                          </div>
                          <div className="rez-podium-pts rez-pts-1">+500 pts</div>
                        </div>
                        <div className="rez-podium-row rez-podium-2">
                          <div className="rez-podium-medal">
                            <Icon name="trophy" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="rez-podium-name" id="pub-rank2-name">
                              {rezPublished?.rank2 || "—"}
                            </div>
                            <div className="rez-podium-sub">{t("rezPodium2Sub")}</div>
                          </div>
                          <div className="rez-podium-pts rez-pts-2">+300 pts</div>
                        </div>
                        <div className="rez-podium-row rez-podium-3">
                          <div className="rez-podium-medal">
                            <Icon name="trophy" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="rez-podium-name" id="pub-rank3-name">
                              {rezPublished?.rank3 || "—"}
                            </div>
                            <div className="rez-podium-sub">{t("rezPodium3Sub")}</div>
                          </div>
                          <div className="rez-podium-pts rez-pts-3">+150 pts</div>
                        </div>
                        <div className="rez-podium-row rez-podium-pub">
                          <div className="rez-podium-medal">
                            <Icon name="leaderboard" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="rez-podium-name" id="pub-publike-name">
                              {rezPublished?.publike || "—"}
                            </div>
                            <div className="rez-podium-sub">{t("rezPodiumPubSub")}</div>
                          </div>
                          <div className="rez-podium-pts rez-pts-pub">+100 pts</div>
                        </div>
                      </div>

                      {/* Sponzorske nagrade - objavljene */}
                      <div className="rez-spon-published">
                        <div className="rez-spon-published-head">{t("rezSponPublishedHead")}</div>

                        <div
                          className="rez-spon-row"
                          style={{ "--accent": "var(--green)" } as CSSProperties}
                        >
                          <div
                            className="rez-spon-row-ic"
                            style={{
                              background: "#0D1A0D",
                              borderColor: "#0F3D30",
                              color: "var(--green)",
                            }}
                          >
                            <Icon name="gamehub" className="ic-sm" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              className="rez-spon-row-name"
                              id="pub-bounty-logitech-name"
                              style={{ color: "var(--green)" }}
                            >
                              {"—"}
                            </div>
                            <div className="rez-spon-row-sub">{t("rezSponRowLogitech")}</div>
                          </div>
                          <div
                            className="rez-spon-row-prize"
                            style={{
                              color: "var(--green)",
                              background: "#0D1A0D",
                              borderColor: "#0F3D30",
                            }}
                          >
                            $500 + Gear
                          </div>
                        </div>

                        <div
                          className="rez-spon-row"
                          style={{ "--accent": "var(--violet-light)" } as CSSProperties}
                        >
                          <div
                            className="rez-spon-row-ic"
                            style={{
                              background: "#0D0D1A",
                              borderColor: "#2D1A55",
                              color: "var(--violet-light)",
                            }}
                          >
                            <Icon name="flame" className="ic-sm" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              className="rez-spon-row-name"
                              id="pub-bounty-anthropic-name"
                              style={{ color: "var(--violet-light)" }}
                            >
                              {"—"}
                            </div>
                            <div className="rez-spon-row-sub">{t("rezSponRowAnthropic")}</div>
                          </div>
                          <div
                            className="rez-spon-row-prize"
                            style={{
                              color: "var(--violet-light)",
                              background: "#0D0D1A",
                              borderColor: "#2D1A55",
                            }}
                          >
                            $1000 + API
                          </div>
                        </div>

                        <div
                          className="rez-spon-row rez-spon-row-last"
                          style={{ "--accent": "var(--red)" } as CSSProperties}
                        >
                          <div
                            className="rez-spon-row-ic"
                            style={{
                              background: "#1A0D0D",
                              borderColor: "#3D1A1A",
                              color: "var(--red)",
                            }}
                          >
                            <Icon name="shield" className="ic-sm" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              className="rez-spon-row-name"
                              id="pub-bounty-jetbrains-name"
                              style={{ color: "var(--red)" }}
                            >
                              {"—"}
                            </div>
                            <div className="rez-spon-row-sub">{t("rezSponRowJetbrains")}</div>
                          </div>
                          <div
                            className="rez-spon-row-prize"
                            style={{
                              color: "var(--red)",
                              background: "#1A0D0D",
                              borderColor: "#3D1A1A",
                            }}
                          >
                            $2000 + IDE
                          </div>
                        </div>
                      </div>

                      {/* Published info */}
                      <div className="rez-published-info">
                        <span className="rez-published-info-ic">
                          <Icon name="check" className="ic-sm" />
                        </span>
                        <div>
                          <div className="rez-published-info-title">{t("rezPublishedTitle")}</div>
                          <div className="rez-published-info-sub" id="pub-timestamp">
                            {rezTimestamp}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* KANBAN PANEL */}
            <div
              id="kanban-panel"
              className="swap-panel"
              style={{ display: panel === "kanban" ? "flex" : "none" }}
            >
              <div className="kanban-head-wrap">
                <div className="kanban-head">
                  <span className="kanban-head-ic">
                    <Icon name="server" />
                  </span>
                  <div>
                    <div className="kanban-head-title">
                      {myTeamName ? t("kanbanTitlePrefix") + myTeamName : t("kanbanTitle")}
                    </div>
                    <div className="kanban-head-sub">{t("kanbanSub")}</div>
                  </div>
                </div>
                {/* "Board settings" placeholder removed: kanban columns are fixed
                  server-side; no column-CRUD API exists. Flagged for backend. */}
              </div>

              <div className="kanban-board">
                {board ? (
                  [...board.columns]
                    .sort((a, b) => a.position - b.position)
                    .map((col) => {
                      const cards: KanbanCard[] = [...col.cards].sort(
                        (a, b) => a.position - b.position,
                      );
                      return (
                        <div
                          className="kanban-col"
                          key={col.columnId}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (dragOverCol !== col.columnId) setDragOverCol(col.columnId);
                          }}
                          onDragLeave={() => {
                            if (dragOverCol === col.columnId) setDragOverCol(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData("text/plain") || dragCardId;
                            onDropCard(id, col.columnId);
                            setDragCardId(null);
                            setDragOverCol(null);
                          }}
                          style={
                            dragOverCol === col.columnId
                              ? { outline: "2px dashed var(--violet-light)" }
                              : undefined
                          }
                        >
                          <div className="kanban-col-header">
                            <span className="kanban-col-title">{col.name}</span>
                            <span className="kanban-col-count">{cards.length}</span>
                          </div>
                          <div className="kanban-cards">
                            {cards.map((card) => (
                              <div
                                className="kanban-card"
                                key={card.cardId}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/plain", card.cardId);
                                  e.dataTransfer.effectAllowed = "move";
                                  setDragCardId(card.cardId);
                                }}
                                onDragEnd={() => {
                                  setDragCardId(null);
                                  setDragOverCol(null);
                                }}
                                style={{ cursor: "grab" }}
                              >
                                <div className="kanban-card-title">
                                  {card.title}
                                  <button
                                    className="kanban-card-del"
                                    type="button"
                                    aria-label={t("kanbanRemoveCard")}
                                    title={t("kanbanRemoveCard")}
                                    onClick={() => removeCard(card.cardId)}
                                  >
                                    <Icon name="x" className="ic-sm" />
                                  </button>
                                </div>
                                {card.description && (
                                  <div className="kanban-card-desc">{card.description}</div>
                                )}
                                {card.assignedToUsername && (
                                  <div className="kanban-card-footer">
                                    <span className="kanban-tag kanban-tag-dev">
                                      {card.assignedToUsername}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                            {addingCol === col.columnId ? (
                              <div className="kanban-add-form">
                                <input
                                  className="kanban-add-input"
                                  type="text"
                                  autoFocus
                                  maxLength={200}
                                  placeholder={t("kanbanCardTitlePh")}
                                  value={newCardTitle}
                                  onChange={(e) => setNewCardTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      submitNewCard();
                                    } else if (e.key === "Escape") {
                                      setAddingCol(null);
                                    }
                                  }}
                                />
                                <textarea
                                  className="kanban-add-textarea"
                                  rows={2}
                                  maxLength={10000}
                                  placeholder={t("kanbanCardDescPh")}
                                  value={newCardDesc}
                                  onChange={(e) => setNewCardDesc(e.target.value)}
                                />
                                <div className="kanban-add-actions">
                                  <button
                                    type="button"
                                    className="kanban-add-submit"
                                    disabled={newCardBusy || !newCardTitle.trim()}
                                    onClick={submitNewCard}
                                  >
                                    {t("kanbanCreate")}
                                  </button>
                                  <button
                                    type="button"
                                    className="kanban-add-cancel"
                                    onClick={() => setAddingCol(null)}
                                  >
                                    {t("kanbanCancel")}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="kanban-add-task"
                                type="button"
                                onClick={() => openAddCard(col.columnId)}
                              >
                                <Icon name="plus" className="ic-sm" /> {t("kanbanAddTask")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="kanban-empty">{t("kanbanEmpty")}</div>
                )}
              </div>
            </div>

            <div
              className="typing-bar"
              id="typing-bar"
              style={
                appMode === "dm" || panel !== "messages" || !typingUser
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="typing-dots">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
              <span>
                <strong>{typingUser}</strong>
                {t("typingSuffix")}
              </span>
            </div>

            <div
              className="chat-input-wrap"
              style={
                (appMode === "server" && panel !== "messages") || nothingOpen
                  ? { display: "none" }
                  : undefined
              }
            >
              {replyTo && (
                <div
                  className="reply-banner"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    marginBottom: 6,
                    borderRadius: 8,
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ opacity: 0.85 }}>
                    {t("ctxReplyingTo")}
                    <strong style={{ color: "var(--violet-light, #b39ddf)" }}>
                      {personName({
                        displayName: replyTo.displayName,
                        username: replyTo.username,
                      })}
                    </strong>
                  </span>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => setReplyTo(null)}
                    style={{
                      marginLeft: "auto",
                      background: "none",
                      border: "none",
                      color: "inherit",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="chat-mdbar">
                {MD_TOOLS.map((tool) => (
                  <button
                    key={tool.key}
                    type="button"
                    className="chat-mdbtn"
                    title={t(tool.key)}
                    aria-label={t(tool.key)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMd(tool.wrap[0], tool.wrap[1])}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              {chatMedia.length > 0 && (
                <div className="chat-media">
                  {chatMedia.map((m) => (
                    <div className={`chat-thumb${m.error ? " is-error" : ""}`} key={m.id}>
                      {m.type === "video" ? (
                        <video className="chat-thumb-el" src={m.previewUrl} muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="chat-thumb-el" src={m.previewUrl} alt="" />
                      )}
                      {m.uploading && <span className="chat-thumb-spin" aria-hidden="true" />}
                      {m.type === "video" && (
                        <span className="chat-thumb-badge" aria-hidden="true">
                          ▶
                        </span>
                      )}
                      <button
                        type="button"
                        className="chat-thumb-x"
                        aria-label={t("removeMedia")}
                        onClick={() => removeChatMedia(m.id)}
                      >
                        <Icon name="x" className="ic-sm" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="chat-input-box" style={{ position: "relative" }}>
                {chatMention.menu}
                <input
                  ref={chatFileRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  onChange={onPickChatMedia}
                />
                <button
                  className="inp-btn"
                  type="button"
                  aria-label={t("addAttachment")}
                  onClick={() => chatFileRef.current?.click()}
                >
                  <Icon name="plus" className="ic-sm" />
                </button>
                {chatPreview ? (
                  <div className="chat-preview" aria-live="polite">
                    {draft.trim() ? (
                      <MarkdownContent>{draft}</MarkdownContent>
                    ) : (
                      <span className="chat-preview-empty">{t("nothingToPreview")}</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    id="msg-input"
                    ref={composerRef}
                    className="chat-textarea"
                    rows={1}
                    aria-label={t("writeMessage")}
                    placeholder={
                      activeChannelType === "announcements" && !can("manage_messages")
                        ? t("announcementReadOnly")
                        : inputPlaceholder
                    }
                    disabled={activeChannelType === "announcements" && !can("manage_messages")}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      autoGrowChat();
                      emitTyping();
                    }}
                    onKeyDown={sendMsg}
                  />
                )}
                <div className="inp-actions">
                  <button
                    className="inp-btn"
                    type="button"
                    aria-label={t("addImage")}
                    onClick={() => chatFileRef.current?.click()}
                  >
                    <Icon name="image" className="ic-sm" />
                  </button>
                  <button
                    className={`inp-btn${chatPreview ? " is-on" : ""}`}
                    type="button"
                    aria-label={chatPreview ? t("editMessage") : t("previewMessage")}
                    title={chatPreview ? t("editMessage") : t("previewMessage")}
                    onClick={() => setChatPreview((v) => !v)}
                  >
                    <Icon name={chatPreview ? "edit" : "eye"} className="ic-sm" />
                  </button>
                  <button
                    className="send-btn"
                    type="button"
                    onClick={sendMsgClick}
                    aria-label={t("sendMessage")}
                    disabled={activeChannelType === "announcements" && !can("manage_messages")}
                  >
                    <Icon name="share" className="ic-sm" />
                  </button>
                </div>
              </div>
            </div>
          </main>

          {/* SERVER: MEMBERS PANEL (right) */}
          <aside
            className={"members-panel" + (appMode !== "server" ? " dm-hidden" : "")}
            id="panel-members"
            aria-label={t("participants")}
            style={appMode === "server" && !membersVisible ? { display: "none" } : undefined}
          >
            <div className="members-header">
              {t("participants")} <span className="members-count">{members.length}</span>
            </div>
            <div className="members-list">
              {/* Real hackathon info card. Hidden entirely until the hackathon is
                loaded (no fake numbers). prizePool stat is rendered only when
                the backend provides one. */}
              {hackathon && (
                <div className="hack-info-card">
                  <div className="hack-info-top">
                    <div className="hack-info-name" title={hackathon.title}>
                      {hackathon.title}
                    </div>
                    {isHackathonActive ? (
                      <div className="hack-info-sub" id="hack-elapsed">
                        {elapsedLabel}
                      </div>
                    ) : nowMs > hackEndMs ? (
                      <div className="hack-info-sub hack-info-ended">{t("hackEnded")}</div>
                    ) : (
                      <div className="hack-info-sub">{t("hackNotStarted")}</div>
                    )}
                  </div>
                  <div className="hack-info-stats">
                    {isHackathonActive && (
                      <>
                        <div className="hack-stat">
                          <span className="hack-stat-label">{t("remaining")}</span>
                          <span className="hack-stat-val" id="timer-val">
                            {timerVal}
                          </span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            id="progress-fill"
                            style={{ width: progressPct + "%" }}
                          ></div>
                        </div>
                      </>
                    )}
                    <div className="hack-stat">
                      <span className="hack-stat-label">{t("teamsStat")}</span>
                      <span className="hack-stat-val">{hackathon.teamCount}</span>
                    </div>
                    {hackathon.prizePool && (
                      <div className="hack-stat hack-stat-prize">
                        <span className="hack-stat-label">{t("prizeStat")}</span>
                        <span className="hack-stat-val hack-stat-lemon" title={hackathon.prizePool}>
                          {hackathon.prizePool}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {members.length > 0 && (
                <>
                  {moderatorMembers.length > 0 && (
                    <>
                      <div className="members-section">
                        {t("moderators")} ({moderatorMembers.length})
                      </div>
                      {moderatorMembers.map((m) => renderMemberRow(m, onlineUsers.has(m.userId)))}
                    </>
                  )}
                  <div className="members-section">
                    {t("membersOnline")} ({onlineNonMods.length})
                  </div>
                  {onlineNonMods.map((m) => renderMemberRow(m, true))}
                  <div className="members-section">
                    {t("membersOffline")} ({offlineNonMods.length})
                  </div>
                  {offlineNonMods.map((m) => renderMemberRow(m, false))}
                </>
              )}
              {members.length === 0 && (
                <div className="members-offline-note">{t("membersOffline")} (0)</div>
              )}
            </div>
          </aside>

          {/* DM: PROFILE PANEL */}
          <aside
            className={"dm-profile-panel" + (appMode === "dm" ? " dm-visible" : "")}
            id="panel-dm-profile"
            aria-label={t("dmProfilePanelAria")}
          >
            {appMode === "dm" &&
              (() => {
                // Real conversation drives the panel; the static DmProfile is
                // only a fallback when there is no real active conversation.
                const conv = dmConvos.find((c) => c.conversationId === activeConvoId);
                const others = conv ? conv.members.filter((m) => m.userId !== user?.userId) : [];

                // 1-1 DM → permanent docked profile card for the other person.
                if (conv && others.length === 1) {
                  const o = others[0];
                  return (
                    <div
                      className={withDecorationClass("dm-docked-card", o.profileDecoration)}
                      style={profileDecorationStyle(o.profileDecoration)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openProfileMenu(
                          { userId: o.userId, username: o.username },
                          e.clientX,
                          e.clientY,
                        );
                      }}
                    >
                      <MiniProfileCard
                        member={o}
                        onOpenProfile={setProfileUsername}
                        viewProfileLabel={t("miniViewProfile")}
                      />
                    </div>
                  );
                }

                // Group DM → server-style member list.
                if (conv && others.length > 1) {
                  return (
                    <div className="members-list">
                      <div className="grp-head">
                        <div className="grp-head-av" aria-hidden="true">
                          {isImageIcon(conv.icon) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className="grp-head-av-img"
                              src={conv.icon}
                              alt={convoTitle(conv)}
                            />
                          ) : (
                            conv.icon || GROUP_ICON_FALLBACK
                          )}
                        </div>
                        <button
                          type="button"
                          className="grp-head-name-btn"
                          title={convoTitle(conv)}
                          onClick={openGroupSettings}
                        >
                          {convoTitle(conv)}
                        </button>
                        <button
                          type="button"
                          className="grp-head-edit"
                          aria-label={t("grpEditAria")}
                          title={t("grpSettings")}
                          onClick={openGroupSettings}
                        >
                          <Icon name="settings" className="ic-sm" />
                        </button>
                      </div>
                      <div className="members-section">
                        {t("dmMembersLabel")} ({conv.members.length})
                      </div>
                      {conv.members.map((m) => (
                        <div
                          className="member-row"
                          key={m.userId}
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setMiniProfile({
                              member: {
                                userId: m.userId,
                                username: m.username,
                                displayName: m.displayName,
                                avatarUrl: m.avatarUrl,
                                bannerUrl: m.bannerUrl,
                                roles: [],
                                teamName: null,
                                isModerator: false,
                                isPremium: m.isPremium,
                                usernameEffect: m.usernameEffect,
                                profileDecoration: m.profileDecoration,
                              },
                              anchorTop: r.top,
                              anchorLeft: r.left,
                            });
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openProfileMenu(
                              { userId: m.userId, username: m.username },
                              e.clientX,
                              e.clientY,
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setMiniProfile({
                              member: {
                                userId: m.userId,
                                username: m.username,
                                displayName: m.displayName,
                                avatarUrl: m.avatarUrl,
                                bannerUrl: m.bannerUrl,
                                roles: [],
                                teamName: null,
                                isModerator: false,
                                isPremium: m.isPremium,
                                usernameEffect: m.usernameEffect,
                                profileDecoration: m.profileDecoration,
                              },
                              anchorTop: r.top,
                              anchorLeft: r.left,
                            });
                          }}
                        >
                          <div className="member-av is-orb">
                            {m.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.avatarUrl} alt={m.username} className="orb-art" />
                            ) : (
                              <GenerativeAvatar seed={m.username} className="orb-art" />
                            )}
                          </div>
                          <div className="member-info">
                            <div className="member-name">
                              {personName({
                                displayName: m.displayName,
                                username: m.username,
                              })}
                            </div>
                            <div className="member-handle">@{m.username}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                // No real active conversation → static fallback only.
                if (!activeConvoId && activeDm) {
                  return <DmProfile entry={DM[activeDm]} />;
                }
                return null;
              })()}
          </aside>
        </div>
      </div>

      {/* Toast + modal popups */}
      {toast && (
        <CohorToast variant={toast.variant} icon={toast.icon} show={toast.show}>
          {toast.content}
        </CohorToast>
      )}
      {chatLb && <ImageLightbox url={chatLb} onClose={() => setChatLb(null)} />}
      <BountyUnapplyModal
        open={unapplyTarget !== null}
        bountyName={unapplyTarget ? unapplyTarget.title : ""}
        onCancel={() => setUnapplyTarget(null)}
        onConfirm={confirmUnapply}
      />
      <ProfilePopup
        open={profileUsername !== null}
        username={profileUsername}
        onClose={() => setProfileUsername(null)}
      />
      {miniProfile && (
        <div
          ref={measureMiniCard}
          key={miniProfile.member.userId}
          className={withDecorationClass("mini-profile-card", miniProfile.member.profileDecoration)}
          role="dialog"
          style={{
            ...profileDecorationStyle(miniProfile.member.profileDecoration),
            // Vertically align with the clicked element (its top edge), but
            // never let the card run off the bottom — clamp by its MEASURED
            // height so it is always fully visible (NOT the mouse position).
            top:
              typeof window !== "undefined"
                ? Math.max(8, Math.min(miniProfile.anchorTop, window.innerHeight - miniCardH - 8))
                : miniProfile.anchorTop,
            // Sit just to the LEFT of the clicked element so the whole member
            // list stays visible; flip to the right only if there's no room.
            left: (() => {
              const CARD_W = 300;
              const GAP = 12;
              if (typeof window === "undefined") return miniProfile.anchorLeft;
              let l = miniProfile.anchorLeft - CARD_W - GAP;
              if (l < 8) l = miniProfile.anchorLeft + 40 + GAP;
              return Math.max(8, Math.min(l, window.innerWidth - CARD_W - 8));
            })(),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MiniProfileCard
            member={miniProfile.member}
            showDetails
            onOpenProfile={(username) => {
              setProfileUsername(username);
              setMiniProfile(null);
            }}
            viewProfileLabel={t("miniViewProfile")}
            rolesLabel={t("miniRolesLabel")}
            teamLabel={t("miniTeamLabel")}
            noTeamLabel={t("miniNoTeam")}
          />
        </div>
      )}
      {showGroupModal && (
        <div
          className="grp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("groupModalTitle")}
          onClick={closeGroupModal}
        >
          <div className="grp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="grp-modal-head">
              <div className="grp-modal-title">{t("groupModalTitle")}</div>
              <button
                type="button"
                className="grp-modal-x"
                aria-label={t("groupCancel")}
                onClick={closeGroupModal}
              >
                <Icon name="x" className="ic-sm" />
              </button>
            </div>

            {/* Name + live avatar preview */}
            <div className="grp-field">
              <label className="grp-label" htmlFor="grp-new-name">
                {t("grpNameLabel")}
              </label>
              <div className="grp-name-row">
                <div className="grp-avatar-wrap" title={t("grpAvatarPreview")}>
                  <div className="grp-avatar-preview" aria-hidden="true">
                    {isImageIcon(groupIcon) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="grp-avatar-preview-img"
                        src={groupIcon}
                        alt={groupName || ""}
                      />
                    ) : (
                      groupIcon || GROUP_ICON_FALLBACK
                    )}
                  </div>
                  {isImageIcon(groupIcon) && (
                    <button
                      type="button"
                      className="grp-icon-clear"
                      aria-label={t("grpClearIcon")}
                      title={t("grpClearIcon")}
                      onClick={() => setGroupIcon("")}
                    >
                      <Icon name="x" className="ic-sm" />
                    </button>
                  )}
                </div>
                <input
                  id="grp-new-name"
                  className="grp-input"
                  type="text"
                  value={groupName}
                  placeholder={t("grpNamePh")}
                  maxLength={60}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
            </div>

            {/* Emoji icon picker */}
            <div className="grp-field">
              <span className="grp-label">{t("grpIconLabel")}</span>
              <div className="grp-emoji-row">
                {GROUP_ICONS.map((emo) => (
                  <button
                    key={emo}
                    type="button"
                    className={"grp-emoji" + (groupIcon === emo ? " grp-emoji-on" : "")}
                    aria-pressed={groupIcon === emo}
                    onClick={() => setGroupIcon((cur) => (cur === emo ? "" : emo))}
                  >
                    {emo}
                  </button>
                ))}
              </div>
              <input
                ref={createIconInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleIconFileChange(e, setGroupIconUploading, setGroupIcon)}
              />
              <button
                type="button"
                className="grp-upload-btn"
                disabled={groupIconUploading}
                onClick={() => createIconInputRef.current?.click()}
              >
                <Icon name="image" className="ic-sm" />
                {groupIconUploading ? t("grpUploading") : t("grpUploadImg")}
              </button>
            </div>

            {/* Members pool */}
            <div className="grp-field grp-field-grow">
              <span className="grp-label">{t("grpMembersHeader")}</span>
              <div className="grp-member-list">
                {members.length === 0 && <div className="grp-empty">{t("groupModalEmpty")}</div>}
                {members.map((m) => {
                  const checked = groupPick.includes(m.userId);
                  return (
                    <label
                      key={m.userId}
                      className={"grp-member-row" + (checked ? " grp-member-on" : "")}
                    >
                      <span className="grp-member-av is-orb">
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatarUrl} alt={m.username} className="orb-art" />
                        ) : (
                          <GenerativeAvatar seed={m.username} className="orb-art" />
                        )}
                      </span>
                      <span className="grp-member-name">
                        {personName({
                          displayName: m.displayName,
                          username: m.username,
                        })}
                      </span>
                      <input
                        type="checkbox"
                        className="grp-check"
                        checked={checked}
                        onChange={() =>
                          setGroupPick((prev) =>
                            prev.includes(m.userId)
                              ? prev.filter((id) => id !== m.userId)
                              : [...prev, m.userId],
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grp-modal-actions">
              <button type="button" className="grp-btn grp-btn-ghost" onClick={closeGroupModal}>
                {t("grpCancel")}
              </button>
              <button
                type="button"
                className="grp-btn grp-btn-primary"
                disabled={groupPick.length === 0}
                onClick={createGroupConvo}
              >
                {t("grpCreate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GROUP SETTINGS (rename / re-icon / add members) */}
      {showGroupSettings &&
        (() => {
          const conv = dmConvos.find((c) => c.conversationId === activeConvoId);
          if (!conv) return null;
          const memberIds = new Set(conv.members.map((m) => m.userId));
          const addable = members.filter((m) => !memberIds.has(m.userId));
          return (
            <div
              className="grp-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={t("grpSettingsTitle")}
              onClick={() => setShowGroupSettings(false)}
            >
              <div className="grp-modal" onClick={(e) => e.stopPropagation()}>
                <div className="grp-modal-head">
                  <div className="grp-modal-title">{t("grpSettingsTitle")}</div>
                  <button
                    type="button"
                    className="grp-modal-x"
                    aria-label={t("grpCancel")}
                    onClick={() => setShowGroupSettings(false)}
                  >
                    <Icon name="x" className="ic-sm" />
                  </button>
                </div>

                {/* Name + icon */}
                <div className="grp-field">
                  <span className="grp-label">{t("grpRename")}</span>
                  <div className="grp-name-row">
                    <div className="grp-avatar-wrap" title={t("grpAvatarPreview")}>
                      <div className="grp-avatar-preview" aria-hidden="true">
                        {isImageIcon(gsIcon) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="grp-avatar-preview-img" src={gsIcon} alt={gsName || ""} />
                        ) : (
                          gsIcon || GROUP_ICON_FALLBACK
                        )}
                      </div>
                      {isImageIcon(gsIcon) && (
                        <button
                          type="button"
                          className="grp-icon-clear"
                          aria-label={t("grpClearIcon")}
                          title={t("grpClearIcon")}
                          onClick={() => setGsIcon("")}
                        >
                          <Icon name="x" className="ic-sm" />
                        </button>
                      )}
                    </div>
                    <input
                      className="grp-input"
                      type="text"
                      value={gsName}
                      placeholder={t("grpNamePh")}
                      maxLength={60}
                      onChange={(e) => setGsName(e.target.value)}
                    />
                  </div>
                  <div className="grp-emoji-row">
                    {GROUP_ICONS.map((emo) => (
                      <button
                        key={emo}
                        type="button"
                        className={"grp-emoji" + (gsIcon === emo ? " grp-emoji-on" : "")}
                        aria-pressed={gsIcon === emo}
                        onClick={() => setGsIcon((cur) => (cur === emo ? "" : emo))}
                      >
                        {emo}
                      </button>
                    ))}
                  </div>
                  <input
                    ref={gsIconInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => handleIconFileChange(e, setGsIconUploading, setGsIcon)}
                  />
                  <button
                    type="button"
                    className="grp-upload-btn"
                    disabled={gsIconUploading}
                    onClick={() => gsIconInputRef.current?.click()}
                  >
                    <Icon name="image" className="ic-sm" />
                    {gsIconUploading ? t("grpUploading") : t("grpUploadImg")}
                  </button>
                  <button
                    type="button"
                    className="grp-btn grp-btn-primary grp-btn-block"
                    onClick={saveGroupSettings}
                  >
                    {t("grpSave")}
                  </button>
                </div>

                {/* Add members */}
                <div className="grp-field grp-field-grow">
                  <span className="grp-label">{t("grpAddMembers")}</span>
                  <div className="grp-member-list">
                    {addable.length === 0 && (
                      <div className="grp-empty">{t("grpNoMembersToAdd")}</div>
                    )}
                    {addable.map((m) => {
                      const checked = gsAddPick.includes(m.userId);
                      return (
                        <label
                          key={m.userId}
                          className={"grp-member-row" + (checked ? " grp-member-on" : "")}
                        >
                          <span className="grp-member-av is-orb">
                            {m.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.avatarUrl} alt={m.username} className="orb-art" />
                            ) : (
                              <GenerativeAvatar seed={m.username} className="orb-art" />
                            )}
                          </span>
                          <span className="grp-member-name">
                            {personName({
                              displayName: m.displayName,
                              username: m.username,
                            })}
                          </span>
                          <input
                            type="checkbox"
                            className="grp-check"
                            checked={checked}
                            onChange={() =>
                              setGsAddPick((prev) =>
                                prev.includes(m.userId)
                                  ? prev.filter((id) => id !== m.userId)
                                  : [...prev, m.userId],
                              )
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grp-modal-actions">
                  <button
                    type="button"
                    className="grp-btn grp-btn-ghost"
                    onClick={() => setShowGroupSettings(false)}
                  >
                    {t("grpCancel")}
                  </button>
                  <button
                    type="button"
                    className="grp-btn grp-btn-primary"
                    disabled={gsAddPick.length === 0}
                    onClick={() => addGroupMembers(gsAddPick)}
                  >
                    {t("grpAddAll")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* MESSAGE CONTEXT MENU (right-click) */}
      {ctxMenu && (
        <div
          className="msg-ctx-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            // Right-clicking inside a menu does nothing (no nested browser menu).
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{
            position: "fixed",
            top: Math.min(
              ctxMenu.y,
              (typeof window !== "undefined" ? window.innerHeight : 800) - 280,
            ),
            left: Math.min(
              ctxMenu.x,
              (typeof window !== "undefined" ? window.innerWidth : 1200) - 220,
            ),
            zIndex: 2000,
            minWidth: 190,
            padding: 6,
            borderRadius: 10,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontSize: 14,
          }}
        >
          {/* Add reaction (expands an emoji row) */}
          <button
            type="button"
            role="menuitem"
            style={CTX_MENU_ITEM_STYLE}
            onClick={() => setCtxReactOpen((o) => !o)}
          >
            {t("ctxReact")}
          </button>
          {ctxReactOpen && (
            <div
              className="msg-ctx-emoji"
              style={{ display: "flex", gap: 2, padding: "2px 6px 6px" }}
            >
              {CTX_EMOJI.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  aria-label={sym}
                  onClick={() => ctxReact(ctxMenu.m.messageId, sym)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 18,
                    padding: 4,
                    borderRadius: 6,
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
          )}

          {/* Edit — only the caller's own messages */}
          {ctxMenu.m.senderId === user?.userId && (
            <button
              type="button"
              role="menuitem"
              style={CTX_MENU_ITEM_STYLE}
              onClick={() => ctxStartEdit(ctxMenu.m)}
            >
              {t("ctxEdit")}
            </button>
          )}

          {/* Reply */}
          <button
            type="button"
            role="menuitem"
            style={CTX_MENU_ITEM_STYLE}
            onClick={() => ctxStartReply(ctxMenu.m)}
          >
            {t("ctxReply")}
          </button>

          {/* Forward */}
          <button
            type="button"
            role="menuitem"
            style={CTX_MENU_ITEM_STYLE}
            onClick={() => {
              setForwardMsg(ctxMenu.m);
              setCtxMenu(null);
              setCtxReactOpen(false);
            }}
          >
            {t("ctxForward")}
          </button>

          {/* Copy */}
          <button
            type="button"
            role="menuitem"
            style={CTX_MENU_ITEM_STYLE}
            onClick={() => ctxCopy(ctxMenu.m.content)}
          >
            {t("ctxCopy")}
          </button>

          {/* Delete — own messages always; others' CHANNEL messages with
              manage_messages. DM messages: author only. Destructive, two-step. */}
          {(ctxMenu.m.senderId === user?.userId ||
            (!!ctxMenu.m.channelId && can("manage_messages"))) &&
            (ctxConfirmDelete ? (
              <button
                type="button"
                role="menuitem"
                className="msg-ctx-danger msg-ctx-danger-confirm"
                style={CTX_MENU_DANGER_STYLE}
                onClick={() => ctxDelete(ctxMenu.m)}
              >
                {t("ctxDeleteConfirm")}
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="msg-ctx-danger"
                style={CTX_MENU_DANGER_STYLE}
                onClick={() => setCtxConfirmDelete(true)}
              >
                {t("ctxDelete")}
              </button>
            ))}
        </div>
      )}

      {/* PROFILE CONTEXT MENU (right-click) */}
      {profileMenu && (
        <div
          className="msg-ctx-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            // Right-clicking inside a menu does nothing (no nested browser menu).
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{
            position: "fixed",
            top: Math.min(
              profileMenu.y,
              (typeof window !== "undefined" ? window.innerHeight : 800) - 200,
            ),
            left: Math.min(
              profileMenu.x,
              (typeof window !== "undefined" ? window.innerWidth : 1200) - 210,
            ),
            zIndex: 2000,
            minWidth: 180,
            padding: 6,
            borderRadius: 10,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontSize: 14,
          }}
        >
          {/* Profile — always available */}
          <button
            type="button"
            role="menuitem"
            style={CTX_MENU_ITEM_STYLE}
            onClick={() => {
              setProfileUsername(profileMenu.username);
              closeProfileMenu();
            }}
          >
            {t("pmProfile")}
          </button>

          {!profileMenu.isSelf && (
            <>
              {/* Message — open or create a 1:1 DM */}
              <button
                type="button"
                role="menuitem"
                style={CTX_MENU_ITEM_STYLE}
                onClick={() => pmMessage(profileMenu.userId)}
              >
                {t("pmMessage")}
              </button>

              {/* Friend — add or remove based on current status */}
              <button
                type="button"
                role="menuitem"
                disabled={relBusy}
                style={{
                  ...CTX_MENU_ITEM_STYLE,
                  opacity: relBusy ? 0.5 : 1,
                  cursor: relBusy ? "default" : "pointer",
                }}
                onClick={() =>
                  pmToggleFriend(profileMenu.userId, profileMenu.rel?.friendStatus === "friends")
                }
              >
                {profileMenu.rel?.friendStatus === "friends"
                  ? t("pmRemoveFriend")
                  : t("pmAddFriend")}
              </button>

              {/* Block — danger styling; unblocks if already blocked */}
              <button
                type="button"
                role="menuitem"
                disabled={relBusy}
                style={{
                  ...CTX_MENU_ITEM_STYLE,
                  color: profileMenu.rel?.isBlocked ? "inherit" : "var(--red, #ef5f6b)",
                  opacity: relBusy ? 0.5 : 1,
                  cursor: relBusy ? "default" : "pointer",
                }}
                onClick={() =>
                  pmToggleBlock(profileMenu.userId, profileMenu.rel?.isBlocked ?? false)
                }
              >
                {profileMenu.rel?.isBlocked ? t("pmUnblock") : t("pmBlock")}
              </button>
            </>
          )}
        </div>
      )}

      {/* FORWARD PICKER MODAL */}
      {forwardMsg && (
        <div
          className="forward-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2100,
          }}
          onClick={() => setForwardMsg(null)}
        >
          <div
            className="forward-modal"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 20,
              width: 320,
              maxWidth: "90vw",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="forward-modal-title" style={{ fontWeight: 600 }}>
              {t("ctxForwardTitle")}
            </div>
            <div
              className="forward-modal-list"
              style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}
            >
              {Object.keys(chanMap).length > 0 && (
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {t("ctxForwardChannels")}
                </div>
              )}
              {Object.entries(chanMap).map(([name, channelId]) => (
                <button
                  key={channelId}
                  type="button"
                  style={CTX_MENU_ITEM_STYLE}
                  onClick={() => forwardToChannel(channelId)}
                >
                  # {name}
                </button>
              ))}
              {dmConvos.length > 0 && (
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>{t("ctxForwardDms")}</div>
              )}
              {dmConvos.map((c) => (
                <button
                  key={c.conversationId}
                  type="button"
                  style={CTX_MENU_ITEM_STYLE}
                  onClick={() => forwardToConvo(c.conversationId)}
                >
                  @ {dmOtherName(c)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CHANNEL CONTEXT MENU (right-click — every member)
          Mark-as-read + mute for everyone; moderators also get Channel
          settings (opens the settings modal below). */}
      {chCtx && (
        <div
          className="msg-ctx-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            // Right-clicking inside a menu does nothing (no nested browser menu).
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{
            position: "fixed",
            top: Math.min(
              chCtx.y,
              (typeof window !== "undefined" ? window.innerHeight : 800) - 170,
            ),
            left: Math.min(
              chCtx.x,
              (typeof window !== "undefined" ? window.innerWidth : 1200) - 210,
            ),
            zIndex: 2000,
            minWidth: 190,
            padding: 6,
            borderRadius: 10,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontSize: 14,
          }}
        >
          <button
            type="button"
            role="menuitem"
            style={CTX_MENU_ITEM_STYLE}
            onClick={() => {
              markChannelReadLocal(chCtx.channelId, chCtx.name);
              setChCtx(null);
            }}
          >
            {t("ctxMarkRead")}
          </button>
          <button
            type="button"
            role="menuitem"
            style={CTX_MENU_ITEM_STYLE}
            onClick={() => {
              toggleMuteChannel(chCtx.channelId);
              setChCtx(null);
            }}
          >
            {mutedChannels.has(chCtx.channelId) ? t("ctxUnmute") : t("ctxMute")}
          </button>
          {can("manage_channels") && (
            <button
              type="button"
              role="menuitem"
              style={CTX_MENU_ITEM_STYLE}
              onClick={() => {
                setChRename({
                  channelId: chCtx.channelId,
                  name: chCtx.name,
                  type: chCtx.type,
                });
                setChRenameName(chCtx.name);
                setChCtxConfirmDelete(false);
                setChCtx(null);
              }}
            >
              {t("chSettingsTitle")}
            </button>
          )}
        </div>
      )}

      {/* CREATE CHANNEL MODAL (manage_channels) */}
      {chCreate && (
        <div
          className="grp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("chNewChannelTitle")}
          onClick={() => setChCreate(null)}
        >
          <div className="grp-modal grp-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="grp-modal-head">
              <div className="grp-modal-title">{t("chNewChannelTitle")}</div>
              <button
                type="button"
                className="grp-modal-x"
                aria-label={t("chCancel")}
                onClick={() => setChCreate(null)}
              >
                <Icon name="x" className="ic-sm" />
              </button>
            </div>
            <div className="grp-field">
              <label className="grp-label" htmlFor="ch-new-name">
                {t("chNameLabel")}
              </label>
              <input
                id="ch-new-name"
                className="grp-input"
                type="text"
                value={chCreateName}
                placeholder={t("chNamePh")}
                maxLength={60}
                autoFocus
                onChange={(e) => {
                  setChCreateName(e.target.value);
                  if (chCreateErr) setChCreateErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreateChannel();
                }}
              />
            </div>
            <div className="grp-field">
              <label className="grp-label" htmlFor="ch-new-type">
                {t("chTypeLabel")}
              </label>
              <select
                id="ch-new-type"
                className="grp-input srv-select"
                value={chCreateType}
                onChange={(e) =>
                  setChCreateType(e.target.value as "general" | "announcements" | "private")
                }
              >
                <option value="general">{t("chTypeGeneral")}</option>
                <option value="announcements">{t("chTypeAnnouncements")}</option>
                <option value="private">{t("chTypePrivate")}</option>
              </select>
            </div>
            {chCreateErr && <div className="srv-inline-err">{chCreateErr}</div>}
            <div className="grp-modal-actions">
              <button
                type="button"
                className="grp-btn grp-btn-ghost"
                onClick={() => setChCreate(null)}
              >
                {t("chCancel")}
              </button>
              <button
                type="button"
                className="grp-btn grp-btn-primary"
                disabled={chBusy || !chCreateName.trim()}
                onClick={submitCreateChannel}
              >
                {t("chCreate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CHANNEL-GROUP MODAL (manage_channels) */}
      {grpCreateOpen && (
        <div
          className="grp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("chNewGroupTitle")}
          onClick={() => setGrpCreateOpen(false)}
        >
          <div className="grp-modal grp-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="grp-modal-head">
              <div className="grp-modal-title">{t("chNewGroupTitle")}</div>
              <button
                type="button"
                className="grp-modal-x"
                aria-label={t("chCancel")}
                onClick={() => setGrpCreateOpen(false)}
              >
                <Icon name="x" className="ic-sm" />
              </button>
            </div>
            <div className="grp-field">
              <label className="grp-label" htmlFor="grp-new-group-name">
                {t("chGroupNameLabel")}
              </label>
              <input
                id="grp-new-group-name"
                className="grp-input"
                type="text"
                value={grpCreateName}
                placeholder={t("chGroupNamePh")}
                maxLength={60}
                autoFocus
                onChange={(e) => setGrpCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreateGroup();
                }}
              />
            </div>
            <div className="grp-modal-actions">
              <button
                type="button"
                className="grp-btn grp-btn-ghost"
                onClick={() => setGrpCreateOpen(false)}
              >
                {t("chCancel")}
              </button>
              <button
                type="button"
                className="grp-btn grp-btn-primary"
                disabled={chBusy || !grpCreateName.trim()}
                onClick={submitCreateGroup}
              >
                {t("chCreate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME CHANNEL MODAL (manage_channels) */}
      {chRename && (
        <div
          className="grp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("chSettingsTitle")}
          onClick={() => setChRename(null)}
        >
          <div className="grp-modal grp-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="grp-modal-head">
              <div className="grp-modal-title">{t("chSettingsTitle")}</div>
              <button
                type="button"
                className="grp-modal-x"
                aria-label={t("chCancel")}
                onClick={() => setChRename(null)}
              >
                <Icon name="x" className="ic-sm" />
              </button>
            </div>
            <div className="grp-field">
              <label className="grp-label" htmlFor="ch-rename-name">
                {t("chNameLabel")}
              </label>
              <input
                id="ch-rename-name"
                className="grp-input"
                type="text"
                value={chRenameName}
                maxLength={60}
                autoFocus
                onChange={(e) => setChRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRenameChannel();
                }}
              />
            </div>
            <div className="grp-field">
              <label className="grp-label">{t("chTypeLabel")}</label>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                {chRename.type === "announcements"
                  ? t("chTypeAnnouncements")
                  : chRename.type === "project"
                    ? t("chTypeProject")
                    : chRename.type === "kanban"
                      ? t("chTypeKanban")
                      : chRename.type === "team"
                        ? t("chTypeTeam")
                        : chRename.type === "private"
                          ? t("chTypePrivate")
                          : t("chTypeGeneral")}
              </div>
            </div>
            <div className="grp-modal-actions">
              <button
                type="button"
                className="grp-btn grp-btn-ghost"
                style={{ marginRight: "auto", color: "#ef4444" }}
                onClick={() => {
                  if (chCtxConfirmDelete) {
                    const id = chRename.channelId;
                    setChRename(null);
                    void submitDeleteChannel(id);
                  } else {
                    setChCtxConfirmDelete(true);
                  }
                }}
              >
                {chCtxConfirmDelete ? t("chDeleteConfirm") : t("chDelete")}
              </button>
              <button
                type="button"
                className="grp-btn grp-btn-ghost"
                onClick={() => setChRename(null)}
              >
                {t("chCancel")}
              </button>
              <button
                type="button"
                className="grp-btn grp-btn-primary"
                disabled={chBusy || !chRenameName.trim()}
                onClick={submitRenameChannel}
              >
                {t("chSave")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SERVER SETTINGS MODAL (manage_server / manage_roles / kick_members) */}
      {serverSettingsOpen && (
        <div
          className="grp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("srvSettingsTitle")}
          onClick={() => setServerSettingsOpen(false)}
        >
          <div className="grp-modal srv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="grp-modal-head">
              <div className="grp-modal-title">{t("srvSettingsTitle")}</div>
              <button
                type="button"
                className="grp-modal-x"
                aria-label={t("srvRoleCancel")}
                onClick={() => setServerSettingsOpen(false)}
              >
                <Icon name="x" className="ic-sm" />
              </button>
            </div>

            <div className="srv-tabs" role="tablist">
              {can("manage_server") && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "overview"}
                  className={"srv-tab" + (settingsTab === "overview" ? " srv-tab-on" : "")}
                  onClick={() => setSettingsTab("overview")}
                >
                  {t("srvTabOverview")}
                </button>
              )}
              {can("manage_roles") && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "roles"}
                  className={"srv-tab" + (settingsTab === "roles" ? " srv-tab-on" : "")}
                  onClick={() => setSettingsTab("roles")}
                >
                  {t("srvTabRoles")}
                </button>
              )}
              {can("kick_members") && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === "members"}
                  className={"srv-tab" + (settingsTab === "members" ? " srv-tab-on" : "")}
                  onClick={() => setSettingsTab("members")}
                >
                  {t("srvTabMembers")}
                </button>
              )}
            </div>

            <div className="srv-tab-body">
              {/* Overview */}
              {settingsTab === "overview" && can("manage_server") && (
                <div className="srv-pane">
                  <div className="grp-field">
                    <label className="grp-label" htmlFor="srv-ov-name">
                      {t("srvOvName")}
                    </label>
                    <input
                      id="srv-ov-name"
                      className="grp-input"
                      type="text"
                      value={ovName}
                      maxLength={80}
                      onChange={(e) => setOvName(e.target.value)}
                    />
                  </div>
                  <div className="srv-img-row">
                    <div className="grp-field srv-img-field">
                      <span className="grp-label">{t("srvOvLogo")}</span>
                      <div className="srv-img-preview">
                        {ovLogo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ovLogo} alt={t("srvOvLogo")} />
                        ) : (
                          <span className="srv-img-ph">{serverInitials(ovName || "")}</span>
                        )}
                      </div>
                      <input
                        ref={ovLogoInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.currentTarget.files?.[0];
                          e.currentTarget.value = "";
                          if (!file) return;
                          setOvLogoUploading(true);
                          uploadGroupIcon(file)
                            .then((r) => setOvLogo(r.url))
                            .catch(() => setOvErr(t("srvUploadFailed")))
                            .finally(() => setOvLogoUploading(false));
                        }}
                      />
                      <div className="srv-img-actions">
                        <button
                          type="button"
                          className="grp-upload-btn"
                          disabled={ovLogoUploading}
                          onClick={() => ovLogoInputRef.current?.click()}
                        >
                          <Icon name="image" className="ic-sm" />
                          {ovLogoUploading ? t("srvOvUploading") : t("srvOvUpload")}
                        </button>
                        {ovLogo && (
                          <button
                            type="button"
                            className="grp-btn grp-btn-ghost srv-clear-btn"
                            onClick={() => setOvLogo(null)}
                          >
                            {t("srvOvClear")}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grp-field srv-img-field">
                      <span className="grp-label">{t("srvOvBanner")}</span>
                      <div className="srv-img-preview srv-img-banner">
                        {ovBanner ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ovBanner} alt={t("srvOvBanner")} />
                        ) : (
                          <span className="srv-img-ph">
                            <Icon name="image" className="ic-sm" />
                          </span>
                        )}
                      </div>
                      <input
                        ref={ovBannerInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.currentTarget.files?.[0];
                          e.currentTarget.value = "";
                          if (!file) return;
                          setOvBannerUploading(true);
                          uploadGroupIcon(file)
                            .then((r) => setOvBanner(r.url))
                            .catch(() => setOvErr(t("srvUploadFailed")))
                            .finally(() => setOvBannerUploading(false));
                        }}
                      />
                      <div className="srv-img-actions">
                        <button
                          type="button"
                          className="grp-upload-btn"
                          disabled={ovBannerUploading}
                          onClick={() => ovBannerInputRef.current?.click()}
                        >
                          <Icon name="image" className="ic-sm" />
                          {ovBannerUploading ? t("srvOvUploading") : t("srvOvUpload")}
                        </button>
                        {ovBanner && (
                          <button
                            type="button"
                            className="grp-btn grp-btn-ghost srv-clear-btn"
                            onClick={() => setOvBanner(null)}
                          >
                            {t("srvOvClear")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {ovErr && <div className="srv-inline-err">{ovErr}</div>}
                  <div className="grp-modal-actions">
                    <button
                      type="button"
                      className="grp-btn grp-btn-primary"
                      disabled={ovBusy}
                      onClick={saveOverview}
                    >
                      {t("srvOvSave")}
                    </button>
                  </div>
                </div>
              )}

              {/* Roles */}
              {settingsTab === "roles" && can("manage_roles") && (
                <div className="srv-pane">
                  {rolesErr && <div className="srv-inline-err">{rolesErr}</div>}
                  {roles.length === 0 && roleEditing !== "new" && (
                    <div className="srv-empty">{t("srvRolesEmpty")}</div>
                  )}

                  {roles.map((r) => {
                    const editing = roleEditing === r.serverRoleId;
                    const roleMembers = members.filter((m) => m.roles.includes(r.name));
                    const addable = members.filter((m) => !m.roles.includes(r.name));
                    return (
                      <div className="srv-role" key={r.serverRoleId}>
                        {editing ? (
                          <RoleEditor
                            t={t}
                            permCatalog={permCatalog}
                            name={roleDraftName}
                            perms={roleDraftPerms}
                            onName={setRoleDraftName}
                            onTogglePerm={toggleDraftPerm}
                            onSave={saveRole}
                            onCancel={() => setRoleEditing(null)}
                            saveLabel={t("srvRoleSave")}
                          />
                        ) : (
                          <>
                            <div className="srv-role-head">
                              <div className="srv-role-meta">
                                <span className="srv-role-name">{r.name}</span>
                                <span className="srv-role-count">
                                  {r.memberCount}
                                  {r.memberCount === 1
                                    ? t("srvRoleMemberOne")
                                    : t("srvRoleMembersSuffix")}
                                </span>
                              </div>
                              <div className="srv-role-actions">
                                <button
                                  type="button"
                                  className="srv-mini-btn"
                                  onClick={() => startEditRole(r)}
                                >
                                  {t("srvRoleEdit")}
                                </button>
                                {roleConfirmDelete === r.serverRoleId ? (
                                  <button
                                    type="button"
                                    className="srv-mini-btn srv-mini-btn-danger srv-mini-btn-confirm"
                                    title={t("srvRoleDeleteConfirm")}
                                    onClick={() => {
                                      setRoleConfirmDelete(null);
                                      removeRole(r.serverRoleId);
                                    }}
                                  >
                                    {t("srvRoleDeleteConfirm")}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="srv-mini-btn srv-mini-btn-danger"
                                    onClick={() => setRoleConfirmDelete(r.serverRoleId)}
                                  >
                                    {t("srvRoleDelete")}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="srv-role-perms">
                              {r.permissions.length === 0 ? (
                                <span className="srv-perm-chip srv-perm-chip-muted">
                                  {t("srvRoleNoPerms")}
                                </span>
                              ) : (
                                r.permissions.map((p) => (
                                  <span className="srv-perm-chip" key={p}>
                                    {p}
                                  </span>
                                ))
                              )}
                            </div>
                            <button
                              type="button"
                              className="srv-role-members-toggle"
                              onClick={() =>
                                setRoleMembersOpen((cur) =>
                                  cur === r.serverRoleId ? null : r.serverRoleId,
                                )
                              }
                            >
                              {t("srvRoleManageMembers")} ({roleMembers.length})
                            </button>
                            {roleMembersOpen === r.serverRoleId && (
                              <div className="srv-role-members">
                                {roleMembers.map((m) => (
                                  <div className="srv-role-member" key={m.userId}>
                                    <span className="srv-role-member-name">
                                      {personName({
                                        displayName: m.displayName,
                                        username: m.username,
                                      })}
                                    </span>
                                    <button
                                      type="button"
                                      className="srv-role-member-x"
                                      aria-label={t("srvRoleRemoveAria")}
                                      onClick={() => removeMemberFromRole(r.serverRoleId, m.userId)}
                                    >
                                      <Icon name="x" className="ic-sm" />
                                    </button>
                                  </div>
                                ))}
                                <select
                                  className="grp-input srv-select srv-role-add"
                                  value=""
                                  onChange={(e) => {
                                    const uid = e.target.value;
                                    if (uid) addMemberToRole(r.serverRoleId, uid);
                                  }}
                                >
                                  <option value="">{t("srvRoleAddMember")}</option>
                                  {addable.map((m) => (
                                    <option key={m.userId} value={m.userId}>
                                      {personName({
                                        displayName: m.displayName,
                                        username: m.username,
                                      })}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {roleEditing === "new" ? (
                    <div className="srv-role srv-role-new">
                      <RoleEditor
                        t={t}
                        permCatalog={permCatalog}
                        name={roleDraftName}
                        perms={roleDraftPerms}
                        onName={setRoleDraftName}
                        onTogglePerm={toggleDraftPerm}
                        onSave={saveRole}
                        onCancel={() => setRoleEditing(null)}
                        saveLabel={t("srvRoleCreate")}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="grp-btn grp-btn-primary srv-new-role-btn"
                      onClick={startNewRole}
                    >
                      <Icon name="plus" className="ic-sm" /> {t("srvNewRole")}
                    </button>
                  )}
                </div>
              )}

              {/* Members */}
              {settingsTab === "members" && can("kick_members") && (
                <div className="srv-pane">
                  {membersErr && <div className="srv-inline-err">{membersErr}</div>}
                  {members.length === 0 && <div className="srv-empty">{t("srvMembersEmpty")}</div>}
                  {members.map((m) => {
                    const isSelf = m.userId === user?.userId;
                    // The organizer carries all permissions and cannot be kicked
                    // (backend 400s). We can't see "organizer" flag directly, but
                    // the kick endpoint guards it; we hide the button for self.
                    return (
                      <div className="srv-member-row" key={m.userId}>
                        <div className="srv-member-av is-orb">
                          <OrbArt url={m.avatarUrl} seed={m.username} />
                        </div>
                        <div className="srv-member-info">
                          <div className="srv-member-name">
                            {personName({
                              displayName: m.displayName,
                              username: m.username,
                            })}
                            {m.isModerator && (
                              <span className="member-mod-badge">{t("srvModeratorBadge")}</span>
                            )}
                          </div>
                          <div className="srv-member-handle">@{m.username}</div>
                        </div>
                        {!isSelf &&
                          (kickConfirm === m.userId ? (
                            <button
                              type="button"
                              className="srv-kick-btn srv-kick-btn-confirm"
                              title={t("srvKickConfirm")}
                              onClick={() => {
                                setKickConfirm(null);
                                kickMember(m.userId);
                              }}
                            >
                              {t("srvKickConfirm")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="srv-kick-btn"
                              onClick={() => setKickConfirm(m.userId)}
                            >
                              {t("srvKick")}
                            </button>
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </MentionClickContext.Provider>
  );
}

/*
   Sub-components
 */

/* Inline editor for creating / editing a server role: name + permission
 * checkboxes (labels + descriptions from the permission catalog). */
export default CohorClient;
