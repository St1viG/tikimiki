/**
 * tikimiki API client.
 *
 * Talks to the NestJS backend at `/api/v1` — same-origin in dev via the Next.js
 * rewrite in next.config.mjs, so the httpOnly refresh cookie is first-party.
 * The short-lived access token is kept in localStorage and sent as a Bearer
 * header; the refresh token lives only in the cookie.
 */
import type {
  AuthResponse,
  FeedPost,
  HackathonSummary,
  HackathonType,
  LoginBody,
  MeResponse,
  RefreshResponse,
  RegisterBody,
} from "@tikimiki/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const TOKEN_KEY = "tikimiki_access";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Endpoints whose own 401/409 are meaningful — never auto-refresh-retry them. */
const NO_RETRY = new Set(["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"]);

async function request<T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  // Access token expired → mint a fresh one from the refresh cookie, retry once.
  if (res.status === 401 && allowRetry && !NO_RETRY.has(path)) {
    try {
      await refreshSession();
    } catch {
      throw new ApiError(401, "Session expired");
    }
    return request<T>(path, init, false);
  }

  if (!res.ok) {
    let body: { message?: string } | null = null;
    try {
      body = (await res.json()) as { message?: string };
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body?.message ?? res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  // Nest sends an EMPTY 200 body when a handler returns null (e.g.
  // /me/active-hackathon with no active hackathon); res.json() would throw
  // on it, so read as text and map empty → null.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const GET = <T>(path: string) => request<T>(path);
const POST = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const PATCH = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
const DELETE = <T>(path: string) => request<T>(path, { method: "DELETE" });

/** Exchange the httpOnly refresh cookie for a fresh access token. */
export async function refreshSession(): Promise<void> {
  const data = await request<RefreshResponse>("/auth/refresh", {
    method: "POST",
  });
  setAccessToken(data.accessToken);
}

// Auth
export async function register(body: RegisterBody): Promise<AuthResponse> {
  const data = await POST<AuthResponse>("/auth/register", body);
  setAccessToken(data.accessToken);
  return data;
}

export async function login(body: LoginBody): Promise<AuthResponse> {
  const data = await POST<AuthResponse>("/auth/login", body);
  setAccessToken(data.accessToken);
  return data;
}

export async function me(): Promise<MeResponse> {
  return GET<MeResponse>("/auth/me");
}

export async function logout(): Promise<void> {
  await POST<void>("/auth/logout");
  setAccessToken(null);
}

/** A rejected organization re-submits its verification request (SSU2). */
export const resubmitOrgVerification = () => POST<{ success: true }>("/auth/organization/resubmit");

// Hackathons
export async function getHackathons(): Promise<HackathonSummary[]> {
  return GET<HackathonSummary[]>("/hackathons");
}

export async function getHackathon(id: string): Promise<HackathonSummary> {
  return GET<HackathonSummary>(`/hackathons/${id}`);
}

/**
 * Body for `POST /hackathons` (organization accounts only). Dates are ISO-8601
 * strings. The backend enforces: startsAt < endsAt, registrationDeadline <
 * startsAt, maxParticipants > 0, maxTeamSize >= minTeamSize, and — for non-virtual
 * types — a location plus a paired latitude/longitude.
 */
/** An application question supplied when publishing a hackathon. */
export interface PublishQuestion {
  prompt: string;
  type: "short_text" | "long_text" | "single_choice" | "multi_choice";
  options?: string[];
  required?: boolean;
  allowOther?: boolean;
}

export interface CreateHackathonBody {
  title: string;
  description: string;
  type: HackathonType;
  theme?: string;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  maxParticipants?: number;
  minTeamSize?: number;
  maxTeamSize: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  logoUrl?: string;
  bannerUrl?: string;
  /** Application-form questions created atomically with the hackathon. */
  questions?: PublishQuestion[];
  /** When publishing from a saved draft, the draft to delete on success. */
  draftId?: string;
}
export const createHackathon = (body: CreateHackathonBody) =>
  POST<HackathonSummary>("/hackathons", body);

/** Body for `PATCH /hackathons/:id` — every field optional; nulls clear. */
export interface UpdateHackathonBody {
  title?: string;
  description?: string;
  type?: HackathonType;
  theme?: string | null;
  startsAt?: string;
  endsAt?: string;
  registrationDeadline?: string;
  maxParticipants?: number | null;
  minTeamSize?: number;
  maxTeamSize?: number;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
}
export const updateHackathon = (id: string, body: UpdateHackathonBody) =>
  PATCH<HackathonSummary>(`/hackathons/${id}`, body);

export const getMyHackathons = () => GET<HackathonSummary[]>("/hackathons/mine");

/* ── hackathon drafts (resumable "organize" form) ─────────── */
export interface HackathonDraft {
  draftId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export const getHackathonDrafts = () => GET<HackathonDraft[]>("/hackathons/drafts");
export const getHackathonDraft = (draftId: string) =>
  GET<HackathonDraft>(`/hackathons/drafts/${draftId}`);
export const createHackathonDraft = (payload: Record<string, unknown>) =>
  POST<HackathonDraft>("/hackathons/drafts", { payload });
export const updateHackathonDraft = (draftId: string, payload: Record<string, unknown>) =>
  PATCH<HackathonDraft>(`/hackathons/drafts/${draftId}`, { payload });
export const deleteHackathonDraft = (draftId: string) =>
  DELETE<{ success: true }>(`/hackathons/drafts/${draftId}`);

// Feed + engagement (posts, comments, likes)
export async function getFeed(): Promise<FeedPost[]> {
  return GET<FeedPost[]>("/feed");
}

/** Fetch a single post by id (powers the shareable permalink / deep-link). */
export const getPost = (postId: string) => GET<FeedPost>(`/posts/${postId}`);

export async function createPost(content: string, attachments: string[] = []): Promise<FeedPost> {
  return POST<FeedPost>("/posts", { content, attachments });
}

/** Edit your own post's text + attachments. Returns the updated post (with editedAt). */
export async function updatePost(
  postId: string,
  content: string,
  attachments: string[] = [],
): Promise<FeedPost> {
  return PATCH<FeedPost>(`/posts/${postId}`, { content, attachments });
}

/** Soft-delete your own post. */
export const deletePost = (postId: string) => DELETE<{ success: true }>(`/posts/${postId}`);

export interface Comment {
  commentId: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string | null;
  authorAvatarUrl: string | null;
  /** Author's equipped username effect (e.g. neon name), null when none. */
  authorUsernameEffect?: EquippedCosmetic | null;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  reactionCount: number;
  likedByMe: boolean;
}
export interface LikeResult {
  liked: boolean;
  reactionCount: number;
}

export const getComments = (postId: string) => GET<Comment[]>(`/posts/${postId}/comments`);
export const createComment = (postId: string, content: string, parentCommentId?: string) =>
  POST<Comment>(`/posts/${postId}/comments`, { content, parentCommentId });
/** Edit your own comment's text. Returns the updated comment (with editedAt). */
export const updateComment = (commentId: string, content: string) =>
  PATCH<Comment>(`/comments/${commentId}`, { content });
export const deleteComment = (commentId: string) =>
  DELETE<{ success: true; deletedCount: number }>(`/comments/${commentId}`);
export const togglePostLike = (postId: string) => POST<LikeResult>(`/posts/${postId}/like`);
export const toggleCommentLike = (commentId: string) =>
  POST<LikeResult>(`/comments/${commentId}/like`);

// Notifications
export interface Notification {
  notificationId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export const getNotifications = (filter: "all" | "unread" = "all") =>
  GET<Notification[]>(`/notifications?filter=${filter}`);
export const getUnreadCount = () => GET<{ count: number }>("/notifications/unread-count");
export const markNotificationRead = (id: string) =>
  PATCH<Notification>(`/notifications/${id}/read`);
export const markAllNotificationsRead = () =>
  POST<{ markedCount: number }>("/notifications/mark-all-read");

// Chat: servers, channels, messages, DMs
export interface ServerSummary {
  serverId: string;
  hackathonId: string;
  hackathonTitle: string;
  name: string;
  logoUrl: string | null;
}
export interface ChannelLite {
  channelId: string;
  name: string;
  type: string;
  position: number;
}
export interface ChannelGroup {
  groupId: string;
  name: string;
  position: number;
  channels: ChannelLite[];
}
export interface ServerDetail {
  serverId: string;
  name: string;
  groups: ChannelGroup[];
}
export interface ChatMessage {
  messageId: string;
  channelId?: string | null;
  conversationId?: string | null;
  senderId: string;
  senderUsername: string;
  senderDisplayName?: string | null;
  senderAvatarUrl: string | null;
  content: string;
  sentAt: string;
  editedAt: string | null;
  replyToId: string | null;
  reactionCount: number;
  reactions: MessageReaction[];
  attachments?: MessageAttachment[];
}
export interface MessageAttachment {
  url: string;
  type: "image" | "video";
  filename?: string | null;
}
export interface MessageReaction {
  symbol: string;
  count: number;
  mine: boolean;
}
export interface ConversationMember {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isPremium: boolean;
  /** Equipped username effect (e.g. neon name), null when none. */
  usernameEffect: EquippedCosmetic | null;
  /** Equipped profile decoration (banner/avatar frame), null when none. */
  profileDecoration: EquippedCosmetic | null;
}
export interface Conversation {
  conversationId: string;
  name: string | null;
  icon: string | null;
  createdAt: string;
  members: ConversationMember[];
  lastMessage: {
    content: string;
    sentAt: string;
    senderUsername: string;
    senderDisplayName?: string | null;
  } | null;
  /** Messages from OTHER members that arrived after the viewer last read it; 0 if none. */
  unreadCount: number;
}

export const getServers = () => GET<ServerSummary[]>("/servers");
export const getServer = (serverId: string) => GET<ServerDetail>(`/servers/${serverId}`);
export interface ServerMember {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  roles: string[];
  teamName: string | null;
  /** True for the organizer or any member whose role carries ≥1 permission. */
  isModerator: boolean;
  /** True when the member currently holds an active Premium subscription. */
  isPremium: boolean;
  /** Equipped username effect (e.g. neon name), null when none. */
  usernameEffect: EquippedCosmetic | null;
  /** Equipped profile decoration (banner/avatar frame), null when none. */
  profileDecoration: EquippedCosmetic | null;
}
export const getServerMembers = (serverId: string) =>
  GET<ServerMember[]>(`/servers/${serverId}/members`);

// Server moderation: permissions, roles, members, channels
/** A permission in the catalog (GET /permissions). */
export interface Permission {
  permissionId: string;
  name: string;
  description: string;
}
/** A server role with its granted permission names + how many members carry it. */
export interface ServerRole {
  serverRoleId: string;
  name: string;
  permissions: string[];
  memberCount: number;
  createdAt: string;
}

/** The full permission catalog (stable across servers). */
export const getPermissionCatalog = () => GET<Permission[]>("/permissions");
/** The current user's effective permission names on a server. */
export const getMyServerPermissions = (serverId: string) =>
  GET<{ permissions: string[] }>(`/servers/${serverId}/my-permissions`);

export const getServerRoles = (serverId: string) => GET<ServerRole[]>(`/servers/${serverId}/roles`);
export const createServerRole = (serverId: string, body: { name: string; permissions: string[] }) =>
  POST<ServerRole>(`/servers/${serverId}/roles`, body);
export const updateServerRole = (
  serverId: string,
  roleId: string,
  body: { name?: string; permissions?: string[] },
) => PATCH<ServerRole>(`/servers/${serverId}/roles/${roleId}`, body);
export const deleteServerRole = (serverId: string, roleId: string) =>
  DELETE<{ success: true }>(`/servers/${serverId}/roles/${roleId}`);
export const addRoleMember = (serverId: string, roleId: string, userId: string) =>
  POST<{ success: true }>(`/servers/${serverId}/roles/${roleId}/members`, {
    userId,
  });
export const removeRoleMember = (serverId: string, roleId: string, userId: string) =>
  DELETE<{ success: true }>(`/servers/${serverId}/roles/${roleId}/members/${userId}`);
/**
 * One-step assign/remove of the canonical "Moderator" role (the backend
 * provisions the role with `manage_messages` on first use). Organizer-gated
 * via `manage_roles`, same as the generic role-membership endpoints.
 */
export const assignServerModerator = (serverId: string, userId: string) =>
  POST<{ success: true }>(`/servers/${serverId}/moderators`, { userId });
export const removeServerModerator = (serverId: string, userId: string) =>
  DELETE<{ success: true }>(`/servers/${serverId}/moderators/${userId}`);
/** Kick a member from the server (400 if the target is the organizer). */
export const kickServerMember = (serverId: string, userId: string) =>
  DELETE<{ success: true }>(`/servers/${serverId}/members/${userId}`);

/** Updated server shape returned by PATCH /servers/:id. */
export interface ServerUpdateResult {
  serverId: string;
  hackathonId: string;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  updatedAt: string;
}
export const updateServer = (
  serverId: string,
  patch: { name?: string; logoUrl?: string | null; bannerUrl?: string | null },
) => PATCH<ServerUpdateResult>(`/servers/${serverId}`, patch);

/** Create a channel group (manage_channels). */
export const createChannelGroup = (serverId: string, name: string) =>
  POST<ChannelGroup>(`/servers/${serverId}/groups`, { name });
/** Create a channel inside a group (manage_channels). 409 on duplicate name. */
export const createChannel = (
  serverId: string,
  body: { groupId: string; name: string; type?: "general" | "announcements" | "private" },
) => POST<ChannelLite>(`/servers/${serverId}/channels`, body);
/** Rename a channel (manage_channels). */
export const renameChannel = (channelId: string, name: string) =>
  PATCH<ChannelLite>(`/channels/${channelId}`, { name });
/** Delete a channel (manage_channels). */
export const deleteChannel = (channelId: string) =>
  DELETE<{ success: true }>(`/channels/${channelId}`);
/** Delete a message (author always; others' channel messages need manage_messages). */
export const deleteMessage = (messageId: string) =>
  DELETE<{ success: true }>(`/messages/${messageId}`);

/** The ongoing hackathon whose cohor server the current user belongs to. */
export interface ActiveHackathon {
  hackathonId: string;
  title: string;
  serverId: string;
  organizationName: string;
}
/** GET /me/active-hackathon → the user's current hackathon, or null if none. */
export const getMyActiveHackathon = () => GET<ActiveHackathon | null>("/me/active-hackathon");

// Social: friends + blocking
export type FriendStatus = "none" | "outgoing" | "incoming" | "friends";
export interface Relationship {
  friendStatus: FriendStatus;
  isBlocked: boolean;
}
export const getRelationship = (userId: string) =>
  GET<Relationship>(`/social/relationship/${userId}`);
export const addFriend = (userId: string) => POST<Relationship>(`/social/friends/${userId}`);
export const removeFriend = (userId: string) => DELETE<Relationship>(`/social/friends/${userId}`);
export const blockUser = (userId: string) => POST<Relationship>(`/social/block/${userId}`);
export const unblockUser = (userId: string) => DELETE<Relationship>(`/social/block/${userId}`);
/** The current user's accepted friends. */
export const getFriends = () => GET<SocialUser[]>("/social/friends");
export const getChannelMessages = (channelId: string) =>
  GET<ChatMessage[]>(`/channels/${channelId}/messages`);
export const sendChannelMessage = (
  channelId: string,
  content: string,
  replyToId?: string,
  attachments: string[] = [],
) =>
  POST<ChatMessage>(`/channels/${channelId}/messages`, {
    content,
    replyToId,
    attachments,
  });
export const toggleMessageReaction = (messageId: string, symbol: string) =>
  POST<{ reacted: boolean; symbol: string; count: number }>(`/messages/${messageId}/reactions`, {
    symbol,
  });
export const getConversations = () => GET<Conversation[]>("/conversations");
export const createConversation = (memberIds: string[], name?: string, icon?: string) =>
  POST<Conversation>("/conversations", { memberIds, name, icon });
/** Update a group conversation's name / icon (null clears a field). */
export const updateConversation = (
  conversationId: string,
  patch: { name?: string | null; icon?: string | null },
) => PATCH<Conversation>(`/conversations/${conversationId}`, patch);
/** Add members to a conversation. */
export const addConversationMembers = (conversationId: string, userIds: string[]) =>
  POST<Conversation>(`/conversations/${conversationId}/members`, { userIds });
export const getConversationMessages = (conversationId: string) =>
  GET<ChatMessage[]>(`/conversations/${conversationId}/messages`);
/** Mark a conversation read for the current user (clears its unread count). */
export const markConversationRead = (conversationId: string) =>
  POST<{ success: true }>(`/conversations/${conversationId}/read`, {});
export const sendDirectMessage = (
  conversationId: string,
  content: string,
  replyToId?: string,
  attachments: string[] = [],
) =>
  POST<ChatMessage>(`/conversations/${conversationId}/messages`, {
    content,
    replyToId,
    attachments,
  });
/** Edit a message you authored. Returns the new content + editedAt. */
export const editMessage = (messageId: string, content: string) =>
  PATCH<{ messageId: string; content: string; editedAt: string }>(`/messages/${messageId}`, {
    content,
  });

/** Find an existing 1:1 conversation with `userId`, or create one. Returns its id. */
export async function startConversation(userId: string): Promise<string> {
  const convs = await getConversations();
  const existing = convs.find(
    (c) => c.members.length === 2 && c.members.some((m) => m.userId === userId),
  );
  if (existing) return existing.conversationId;
  const created = await createConversation([userId]);
  return created.conversationId;
}

// Users: profile, settings, social
/** An equipped cosmetic shaped for rendering (name + render hints). */
export interface EquippedCosmetic {
  cosmeticId: string;
  name: string;
  renderData: Record<string, unknown>;
}
export interface MyProfile {
  userId: string;
  username: string;
  displayName: string | null;
  email: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  points: number;
  skills: string[];
  /** Subset of `skills` GitHub-verified via `POST /users/me/github/sync`. */
  verifiedSkillNames: string[];
  isPremium: boolean;
  createdAt: string;
}
export interface PublicProfile {
  userId: string;
  username: string;
  displayName: string | null;
  /** Present only when the user enabled the `showEmail` privacy setting. */
  email: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  points: number;
  skills: string[];
  /** Subset of `skills` GitHub-verified via `POST /users/me/github/sync`. */
  verifiedSkillNames: string[];
  badges: {
    badgeId: string;
    name: string;
    /** How the badge is earned (English fallback; known names are translated client-side). */
    description: string;
    iconUrl: string;
    category: string;
    /** When this user earned the badge (ISO). */
    awardedAt: string;
  }[];
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isPremium: boolean;
  /** Equipped username effect (e.g. neon name), null when none. */
  usernameEffect: EquippedCosmetic | null;
  /** Equipped profile decoration (banner/avatar frame), null when none. */
  profileDecoration: EquippedCosmetic | null;
  createdAt: string;
}
export interface UpdateProfileBody {
  username?: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  skills?: string[];
}
export interface PointsSummary {
  points: number;
  transactions: {
    transactionId: string;
    type: string;
    delta: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
  }[];
}

export const getMyProfile = () => GET<MyProfile>("/users/me/profile");
export const updateMyProfile = (body: UpdateProfileBody) =>
  PATCH<MyProfile>("/users/me/profile", body);
export const changePassword = (currentPassword: string, newPassword: string) =>
  PATCH<{ success: true }>("/users/me/password", { currentPassword, newPassword });
export const getPublicProfile = (username: string) => GET<PublicProfile>(`/users/${username}`);
export const toggleFollow = (userId: string) =>
  POST<{ following: boolean; followerCount: number }>(`/users/${userId}/follow`);
export const getMyPoints = () => GET<PointsSummary>("/users/me/points");

export interface SocialUser {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
}
/** Prefix search over username + display name — powers @-mention autocomplete. */
export const searchUsers = (q: string, limit = 8) =>
  GET<SocialUser[]>(`/users/search?q=${encodeURIComponent(q)}&limit=${limit}`);
export const getFollowers = (username: string) => GET<SocialUser[]>(`/users/${username}/followers`);
export const getFollowing = (username: string) => GET<SocialUser[]>(`/users/${username}/following`);
export const getUserPosts = (username: string) => GET<FeedPost[]>(`/users/${username}/posts`);

// Teams
export interface Team {
  teamId: string;
  name: string;
  hackathonId: string;
  hackathonTitle: string;
  status: string;
  /** The caller's own hackathon-application status: "pending" | "approved" | "rejected" | "none". */
  applicationStatus: string;
  /** The Cohor server for this team's hackathon — null if it has none yet. */
  serverId: string | null;
  memberCount: number;
  totalXp: number;
  members: { userId: string; username: string; displayName?: string | null; role: string }[];
  createdAt: string;
}
export interface OpenTeam {
  teamId: string;
  name: string;
  hackathonId: string;
  hackathonTitle: string;
  memberCount: number;
  maxTeamSize: number;
  members: { userId: string; username: string; displayName?: string | null }[];
}
export interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  hackathonTitle: string;
  totalXp: number;
  members: { userId: string; username: string; displayName?: string | null }[];
}
export interface SoloPlayer {
  userId: string;
  username: string;
  displayName?: string | null;
  bio: string | null;
  points: number;
  skills: string[];
}

export const getMyTeams = () => GET<Team[]>("/teams/me");
export const getOpenTeams = () => GET<OpenTeam[]>("/teams/open");
export const getTeamLeaderboard = () => GET<LeaderboardEntry[]>("/teams/leaderboard");
export const getSoloPlayers = () => GET<SoloPlayer[]>("/teams/solo");
export const createTeam = (name: string, hackathonId: string) =>
  POST<Team>("/teams", { name, hackathonId });
export const joinTeam = (teamId: string) => POST<Team>(`/teams/${teamId}/join`);

export interface TeamJoinRequest {
  requestId: string;
  teamId: string;
  userId: string;
  username: string;
  displayName?: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}
export interface TeamInvitation {
  invitationId: string;
  teamId: string;
  teamName: string;
  hackathonTitle: string;
  invitedByUsername: string | null;
  invitedByDisplayName?: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}

// Join requests (member → team; leader approves)
export const requestToJoinTeam = (teamId: string, message?: string) =>
  POST<TeamJoinRequest>(`/teams/${teamId}/join-requests`, { message });
export const getTeamJoinRequests = (teamId: string) =>
  GET<TeamJoinRequest[]>(`/teams/${teamId}/join-requests`);
export const acceptJoinRequest = (id: string) =>
  POST<{ success: true; status: string }>(`/teams/join-requests/${id}/accept`);
export const declineJoinRequest = (id: string) =>
  POST<{ success: true; status: string }>(`/teams/join-requests/${id}/decline`);

// Invitations (leader → member; invitee approves)
export const inviteToTeam = (teamId: string, userId: string, message?: string) =>
  POST<TeamInvitation>(`/teams/${teamId}/invitations`, { userId, message });
export const getMyInvitations = () => GET<TeamInvitation[]>("/teams/invitations/me");
export const getInvitationCount = () => GET<{ count: number }>("/teams/invitations/count");
export const acceptInvitation = (id: string) =>
  POST<{ success: true; status: string }>(`/teams/invitations/${id}/accept`);
export const declineInvitation = (id: string) =>
  POST<{ success: true; status: string }>(`/teams/invitations/${id}/decline`);

// Team suggestions (matching)
export interface TeammateSuggestion {
  userId: string;
  username: string;
  displayName?: string | null;
  skills: string[];
  score: number;
}
export interface TeamSuggestion extends OpenTeam {
  score: number;
}
export interface TeamSuggestions {
  teammates: TeammateSuggestion[];
  teams: TeamSuggestion[];
}

export const getTeamSuggestions = (hackathonId: string) =>
  GET<TeamSuggestions>(`/hackathons/${hackathonId}/team-suggestions`);

// Applications
export interface Application {
  applicationId: string;
  hackathonId: string;
  hackathonTitle: string;
  teamId: string | null;
  teamName: string | null;
  status: string;
  rejectionReason?: string | null;
  createdAt: string;
}
export interface ApplicantSkill {
  name: string;
  /** Auto-verified from the applicant's GitHub activity. */
  verified: boolean;
}
export interface Applicant {
  applicationId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  teamId: string | null;
  teamName: string | null;
  status: string;
  createdAt: string;
  skills: ApplicantSkill[];
  githubVerifiedSkillCount: number;
}
export type ApplicantSortBy = "recent" | "skills" | "github";
/** Query filters for {@link getHackathonApplicants}. */
export interface ApplicantFilter {
  skills?: string[];
  githubVerified?: boolean;
  sortBy?: ApplicantSortBy;
}
export interface ApplicationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  waitlisted: number;
  maxParticipants: number | null;
}

export interface ApplicationQuestion {
  questionId: string;
  hackathonId: string;
  prompt: string;
  type: "short_text" | "long_text" | "single_choice" | "multi_choice";
  options: string[] | null;
  required: boolean;
  allowOther: boolean;
  position: number;
}
export interface ApplicationAnswer {
  questionId: string;
  prompt: string;
  type: string;
  answer: string;
}
export interface AnswerInput {
  questionId: string;
  answer: string;
}

export const applyToHackathon = (hackathonId: string, teamId?: string, answers?: AnswerInput[]) =>
  POST<Application>("/applications", { hackathonId, teamId, answers });
export const getApplicationQuestions = (hackathonId: string) =>
  GET<ApplicationQuestion[]>(`/applications/hackathon/${hackathonId}/questions`);
export const createApplicationQuestion = (
  hackathonId: string,
  body: {
    prompt: string;
    type?: ApplicationQuestion["type"];
    options?: string[];
    required?: boolean;
    allowOther?: boolean;
    position?: number;
  },
) => POST<ApplicationQuestion>(`/applications/hackathon/${hackathonId}/questions`, body);
export const updateApplicationQuestion = (
  questionId: string,
  patch: {
    prompt?: string;
    type?: ApplicationQuestion["type"];
    options?: string[];
    required?: boolean;
    allowOther?: boolean;
    position?: number;
  },
) => PATCH<ApplicationQuestion>(`/applications/questions/${questionId}`, patch);
export const deleteApplicationQuestion = (questionId: string) =>
  DELETE<{ success: true }>(`/applications/questions/${questionId}`);
export const getApplicationAnswers = (applicationId: string) =>
  GET<ApplicationAnswer[]>(`/applications/${applicationId}/answers`);
export const getMyApplications = () => GET<Application[]>("/applications/me");
export function getHackathonApplicants(
  hackathonId: string,
  filter: ApplicantFilter = {},
): Promise<Applicant[]> {
  const qs = new URLSearchParams();
  for (const skill of filter.skills ?? []) qs.append("skills", skill);
  if (filter.githubVerified !== undefined) qs.set("githubVerified", String(filter.githubVerified));
  if (filter.sortBy) qs.set("sortBy", filter.sortBy);
  const query = qs.toString();
  return GET<Applicant[]>(`/applications/hackathon/${hackathonId}${query ? `?${query}` : ""}`);
}
export const getApplicationStats = (hackathonId: string) =>
  GET<ApplicationStats>(`/applications/hackathon/${hackathonId}/stats`);
export const approveApplication = (id: string) => PATCH<Application>(`/applications/${id}/approve`);
export const rejectApplication = (id: string, reason?: string) =>
  PATCH<Application>(`/applications/${id}/reject`, { reason });

// Games (gamehub)
export interface Game {
  gameId: string;
  slug: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  baseDailyPlays: number;
  maxPointsPerPlay: number | null;
}
export interface GameTodayState {
  gameId: string;
  slug: string;
  name: string;
  playsUsedToday: number;
  playsAllowed: number;
  playedToday: boolean;
  bestScoreToday: number | null;
}
export interface PlayResult {
  playId: string;
  score: number;
  pointsAwarded: number;
  newBalance: number;
}

export const getGames = () => GET<Game[]>("/games");
export const getGamesToday = () => GET<GameTodayState[]>("/games/me/today");
export const recordGamePlay = (gameId: string, score: number, points?: number, perfect?: boolean) =>
  POST<PlayResult>(`/games/${gameId}/plays`, { score, points, perfect });
export const getGameLeaderboard = (gameId: string) =>
  GET<{
    entries: { rank: number; userId: string; username: string; score: number; playedAt: string }[];
  }>(`/games/${gameId}/leaderboard`);

// Store (commerce)
export interface Cosmetic {
  cosmeticId: string;
  type: string;
  name: string;
  description: string | null;
  rarity: string;
  pointCost: number | null;
}
export interface MerchVariant {
  variantId: string;
  label: string;
  stock: number;
}
export interface Merch {
  merchId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pointCost: number;
  isAvailable: boolean;
  variants: MerchVariant[];
}
export interface MerchOrderBody {
  variantId?: string;
  shippingName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingCountry: string;
  shippingZip: string;
}

/** A cosmetic the user owns, as returned by GET /store/me/inventory. */
export interface InventoryCosmetic {
  cosmeticId: string;
  name: string;
  type: string;
  rarity: string;
  /** Render hints (e.g. { glow: "#A78BFA" } for neon effects). */
  renderData: Record<string, unknown>;
  /** Whether the cosmetic is currently equipped in its slot. */
  equipped: boolean;
  obtainedAt: string;
}

export const getCosmetics = () => GET<Cosmetic[]>("/store/cosmetics");
export const getMerch = () => GET<Merch[]>("/store/merch");
export const getInventory = () => GET<{ cosmetics: InventoryCosmetic[] }>("/store/me/inventory");
export const buyCosmetic = (cosmeticId: string) =>
  POST<{ success: true; newBalance: number }>(`/store/cosmetics/${cosmeticId}/buy`);
export const equipCosmetic = (cosmeticId: string) =>
  POST<{ success: true; equipped: boolean }>(`/store/cosmetics/${cosmeticId}/equip`);
export const unequipCosmetic = (cosmeticId: string) =>
  POST<{ success: true; equipped: boolean }>(`/store/cosmetics/${cosmeticId}/unequip`);
export const orderMerch = (merchId: string, body: MerchOrderBody) =>
  POST<{ orderId: string; status: string; pointsSpent: number; newBalance: number }>(
    `/store/merch/${merchId}/order`,
    body,
  );

// Subscriptions (premium)
export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
}
export interface Subscription {
  subscriptionId: string;
  plan: string;
  status: string;
  startedAt: string;
  endsAt: string;
  cancelledAt: string | null;
}

export const getSubscriptionPlans = () =>
  GET<{ plans: SubscriptionPlan[] }>("/subscriptions/plans");
export const getMySubscription = () =>
  GET<{ subscription: Subscription | null }>("/subscriptions/me");
export const activateSubscription = (billingCycle: "monthly" | "annual") =>
  POST<Subscription>("/subscriptions/activate", { billingCycle });
export const cancelSubscription = () => POST<{ success: true }>("/subscriptions/cancel");

// Reports (moderation)
export type ReportTargetType = "user" | "post" | "comment" | "message" | "hackathon";
export type ReportCategory = "spam" | "harassment" | "inappropriate_content" | "other";

export interface Report {
  reportId: string;
  reporterId: string;
  reporterUsername: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  reason: string | null;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export const createReport = (
  targetType: ReportTargetType,
  targetId: string,
  category: ReportCategory,
  reason?: string,
) => POST<Report>("/reports", { targetType, targetId, category, reason });
/**
 * `serverId` scopes to one Cohor server's message reports (the hackathon's
 * organizer, an assigned server "Moderator", or an admin). Omitted → the
 * platform-wide, admin-only view across every report type.
 */
export const getReports = (status: "pending" | "resolved" | "all" = "pending", serverId?: string) =>
  GET<{ reports: Report[]; stats: { open: number; resolvedToday: number; total: number } }>(
    `/reports?status=${status}${serverId ? `&serverId=${serverId}` : ""}`,
  );
export const resolveReport = (
  id: string,
  status: "resolved" | "dismissed",
  opts?: { note?: string; removeContent?: boolean; banUser?: boolean },
) =>
  POST<Report>(`/reports/${id}/resolve`, {
    status,
    note: opts?.note,
    removeContent: opts?.removeContent ?? false,
    banUser: opts?.banUser ?? false,
  });

// Admin
export interface AdminMetrics {
  totalUsers: number;
  newRegistrations7d: number;
  activeHackathons: number;
  openReports: number;
  activity: { date: string; count: number }[];
  reportsByCategory: { category: string; count: number }[];
  health: {
    totalPosts: number;
    totalTeams: number;
    totalHackathons: number;
    pendingAppeals: number;
    bannedUsers: number;
  };
}
export interface AuditEntry {
  logId: string;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  createdAt: string;
}
export interface Appeal {
  appealId: string;
  userId: string;
  username: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
export interface AdminUser {
  userId: string;
  username: string;
  email: string;
  role: "admin" | "organization" | "member";
  banned: boolean;
  createdAt: string;
}
export interface AdminOrg {
  userId: string;
  name: string;
  websiteUrl: string | null;
  contactEmail: string | null;
  verificationStatus: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  username: string;
  accountEmail: string;
  submittedAt: string;
}

export interface ModerationServer {
  hackathonId: string;
  hackathonTitle: string;
  serverId: string;
  organizationName: string;
  openReportCount: number;
}

export const getAdminMetrics = () => GET<AdminMetrics>("/admin/metrics");
export const getAdminUsers = (search?: string) =>
  GET<AdminUser[]>(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const getAdminOrganizations = () =>
  GET<{ pending: AdminOrg[]; verified: AdminOrg[]; rejected: AdminOrg[] }>("/admin/organizations");
export const getAdminModerationServers = () => GET<ModerationServer[]>("/admin/moderation-servers");
export const verifyOrganization = (userId: string) =>
  POST<AdminOrg>(`/admin/organizations/${userId}/verify`);
export const rejectOrganization = (userId: string, reason: string) =>
  POST<AdminOrg>(`/admin/organizations/${userId}/reject`, { reason });
export const banUser = (userId: string, reason: string) =>
  POST<{ success: true }>(`/admin/users/${userId}/ban`, { reason });
export const unbanUser = (userId: string) =>
  POST<{ success: true }>(`/admin/users/${userId}/unban`);

// Projects (team submissions)
export type ProjectStatus = "draft" | "submitted" | "under_review" | "judged";
export interface Project {
  projectId: string;
  teamId: string;
  teamName: string;
  hackathonId: string;
  status: ProjectStatus;
  title: string;
  description: string | null;
  repositoryUrl: string | null;
  videoUrl: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ProjectInput {
  title: string;
  description?: string | null;
  repositoryUrl?: string | null;
  videoUrl?: string | null;
}
/** The caller's team project, or null if the team hasn't started one. */
export const getTeamProject = (teamId: string) =>
  GET<{ project: Project | null }>(`/teams/${teamId}/project`).then((r) => r.project);
export const createProject = (teamId: string, body: ProjectInput) =>
  POST<Project>(`/teams/${teamId}/project`, body);
export const updateProject = (projectId: string, body: Partial<ProjectInput>) =>
  PATCH<Project>(`/projects/${projectId}`, body);
export const submitProject = (projectId: string) => POST<Project>(`/projects/${projectId}/submit`);
export const withdrawProject = (projectId: string) =>
  POST<Project>(`/projects/${projectId}/withdraw`);
export const getProject = (projectId: string) => GET<Project>(`/projects/${projectId}`);
/** Every submitted project in a hackathon (public showcase / judging). */
export const getHackathonSubmissions = (hackathonId: string) =>
  GET<Project[]>(`/hackathons/${hackathonId}/submissions`);

// Audience voting (hackathon projects)
export interface ProjectVote {
  projectId: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  voteCount: number;
  hasUserVoted: boolean;
}
export const getHackathonProjects = (hackathonId: string) =>
  GET<ProjectVote[]>(`/hackathons/${hackathonId}/projects`);
export const castVote = (hackathonId: string, projectId: string) =>
  POST<{ success: true; voteCount: number }>(
    `/hackathons/${hackathonId}/projects/${projectId}/vote`,
  );
export const getMyVote = (hackathonId: string) =>
  GET<{ projectId: string | null }>(`/hackathons/${hackathonId}/my-vote`);

// Kanban (per-team board)
export interface KanbanCard {
  cardId: string;
  columnId: string;
  title: string;
  description: string | null;
  assignedTo: string | null;
  assignedToUsername: string | null;
  position: number;
  createdAt: string;
}
export interface KanbanColumn {
  columnId: string;
  name: string;
  position: number;
  cards: KanbanCard[];
}
export interface KanbanBoard {
  boardId: string;
  teamId: string;
  columns: KanbanColumn[];
}
export const getKanbanBoard = (teamId: string) => GET<KanbanBoard>(`/teams/${teamId}/kanban`);
export const createKanbanCard = (
  teamId: string,
  input: { columnId: string; title: string; description?: string },
) => POST<KanbanCard>(`/teams/${teamId}/kanban/cards`, input);
export const updateKanbanCard = (
  cardId: string,
  input: {
    columnId?: string;
    title?: string;
    description?: string;
    position?: number;
    assignedTo?: string | null;
  },
) => PATCH<KanbanCard>(`/kanban/cards/${cardId}`, input);
export const deleteKanbanCard = (cardId: string) =>
  DELETE<{ success: true }>(`/kanban/cards/${cardId}`);
export const addKanbanColumn = (teamId: string, name: string) =>
  POST<KanbanColumn>(`/teams/${teamId}/kanban/columns`, { name });
export const updateKanbanColumn = (columnId: string, name: string) =>
  PATCH<KanbanColumn>(`/kanban/columns/${columnId}`, { name });
export const deleteKanbanColumn = (columnId: string) =>
  DELETE<{ success: true; movedCards: number }>(`/kanban/columns/${columnId}`);

// File uploads (avatar / banner)
/** POST a single file as multipart/form-data; retries once on a stale token. */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const send = async (): Promise<Response> => {
    const form = new FormData();
    form.append("file", file);
    const token = getAccessToken();
    return fetch(`${BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  };
  let res = await send();
  if (res.status === 401) {
    try {
      await refreshSession();
    } catch {
      throw new ApiError(401, "Session expired");
    }
    res = await send();
  }
  if (!res.ok) {
    let body: { message?: string } | null = null;
    try {
      body = (await res.json()) as { message?: string };
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body?.message ?? res.statusText, body);
  }
  return (await res.json()) as T;
}
export const uploadMedia = (file: File) => uploadFile<{ url: string }>("/uploads/media", file);
/** Upload a project presentation video (MP4/WebM); returns its public URL. */
export const uploadProjectVideo = (file: File) =>
  uploadFile<{ url: string }>("/uploads/video", file);
export const uploadAvatar = (file: File) =>
  uploadFile<{ avatarUrl: string }>("/users/me/avatar", file);
export const uploadBanner = (file: File) =>
  uploadFile<{ bannerUrl: string }>("/users/me/banner", file);
export const uploadGroupIcon = (file: File) => uploadFile<{ url: string }>("/uploads/image", file);
export const deleteAvatarImage = () => DELETE<{ success: true }>("/users/me/avatar");
export const deleteBannerImage = () => DELETE<{ success: true }>("/users/me/banner");

// OAuth (GitHub / Google / LinkedIn)
/** Full-page navigation target that kicks off the provider OAuth flow. */
export const oauthUrl = (provider: "github" | "google" | "linkedin", opts?: { link?: boolean }) =>
  `${BASE}/auth/oauth/${provider}${opts?.link ? "?link=1" : ""}`;

/** Registration pre-flight: which of the given identifiers are still free. */
export const checkAvailability = (params: { email?: string; username?: string }) => {
  const q = new URLSearchParams();
  if (params.email) q.set("email", params.email);
  if (params.username) q.set("username", params.username);
  return GET<{ email?: boolean; username?: boolean }>(`/auth/availability?${q.toString()}`);
};

// Admin: audit log + appeals
export const getAuditLog = (search?: string) =>
  GET<AuditEntry[]>(`/admin/audit${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const getAppeals = () => GET<{ pending: Appeal[]; closed: Appeal[] }>("/admin/appeals");
export const resolveAppeal = (appealId: string, decision: "approve" | "reject", note?: string) =>
  POST<Appeal>(`/admin/appeals/${appealId}/resolve`, { decision, note });

// Audience voting status (window)
export interface VotingStatus {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  serverTime: string;
}
export const getVotingStatus = (hackathonId: string) =>
  GET<VotingStatus>(`/hackathons/${hackathonId}/voting-status`);

// Account: email verify / password reset / change email / ban appeal
export const requestEmailVerification = () =>
  POST<{ alreadyVerified: boolean; devLink?: string }>("/auth/verify-email/request");
export const confirmEmailVerification = (token: string) =>
  POST<{ success: true }>("/auth/verify-email/confirm", { token });
export const forgotPassword = (email: string) =>
  POST<{ devLink?: string }>("/auth/password/forgot", { email });
export const resetPassword = (token: string, newPassword: string) =>
  POST<{ success: true }>("/auth/password/reset", { token, newPassword });
export const changeEmail = (email: string) =>
  POST<{ success: true; devLink?: string }>("/auth/change-email", { email });
export const submitBanAppeal = (email: string, password: string, reason: string) =>
  POST<{ success: true }>("/auth/appeal", { email, password, reason });

// Bounties + official results
export interface Bounty {
  bountyId: string;
  sponsorName: string;
  title: string;
  theme: string | null;
  description: string | null;
  prizeAward: string | null;
  applicantCount: number;
  hasApplied: boolean;
}
export interface PodiumEntry {
  rank: number | null;
  projectId: string;
  teamName: string;
  title: string;
}
export interface BountyWinner {
  bountyId: string;
  bountyTitle: string;
  sponsorName: string;
  projectId: string;
  teamName: string;
  title: string;
}
export interface HackathonResults {
  published: boolean;
  podium: PodiumEntry[];
  bountyWinners: BountyWinner[];
}
export const listBounties = (hackathonId: string) =>
  GET<Bounty[]>(`/hackathons/${hackathonId}/bounties`);
export const applyToBounty = (hackathonId: string, bountyId: string) =>
  POST<{ success: true; applicantCount: number }>(
    `/hackathons/${hackathonId}/bounties/${bountyId}/apply`,
  );
export const unapplyFromBounty = (hackathonId: string, bountyId: string) =>
  DELETE<{ success: true; applicantCount: number }>(
    `/hackathons/${hackathonId}/bounties/${bountyId}/apply`,
  );
export const getHackathonResults = (hackathonId: string) =>
  GET<HackathonResults>(`/hackathons/${hackathonId}/results`);
export const publishHackathonResults = (
  hackathonId: string,
  rankings: { projectId: string; rank: number }[],
) => POST<HackathonResults>(`/hackathons/${hackathonId}/results`, { rankings });
/** Set (or clear, with null) the winning project of one bounty (organizer/admin). */
export const setBountyWinner = (hackathonId: string, bountyId: string, projectId: string | null) =>
  POST<HackathonResults>(`/hackathons/${hackathonId}/bounties/${bountyId}/winner`, { projectId });

// Settings: privacy / notifications + integrations
export interface UserSettings {
  profileVisibility: "all" | "members" | "none";
  visibleToRecruiters: boolean;
  showEmail: boolean;
  showLocation: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}
export interface Integrations {
  github: { connected: boolean; username: string | null };
  google: { connected: boolean };
  linkedin: { connected: boolean };
}
export const getSettings = () => GET<UserSettings>("/settings");
export const updateSettings = (patch: Partial<UserSettings>) =>
  PATCH<UserSettings>("/settings", patch);
export const getIntegrations = () => GET<Integrations>("/settings/integrations");
export const disconnectIntegration = (provider: "github" | "google" | "linkedin") =>
  DELETE<Integrations>(`/settings/integrations/${provider}`);

// ── github skills sync (Nenad) ──
export interface GithubProfileStats {
  repos: number;
  topLanguages: string[];
  stars: number;
}
export interface VerifiedSkill {
  name: string;
  verified: boolean;
  source: string;
}
export interface GithubSyncResult {
  stats: GithubProfileStats;
  verifiedSkills: VerifiedSkill[];
}
export const syncGithubSkills = () => POST<GithubSyncResult>("/users/me/github/sync");

// ── Pretraga (Stevan) ──
/**
 * A single search hit. The backend shapes users, organizations and hackathons
 * into this uniform structure regardless of their underlying table.
 */
export interface SearchHit {
  id: string;
  label: string;
  subtitle?: string;
  imageUrl?: string;
  /** Set only on organization hits, so the UI can link to `/u/:username`. */
  username?: string;
}
export type SearchUserHit = SearchHit;
export type SearchOrgHit = SearchHit;
export type SearchHackathonHit = SearchHit;

/** Response of `GET /search`, grouped by entity type. */
export interface SearchResult {
  users: SearchUserHit[];
  organizations: SearchOrgHit[];
  hackathons: SearchHackathonHit[];
}

/** Query + optional filters for {@link searchAll}. */
export interface SearchParams {
  q?: string;
  skills?: string[];
  location?: string;
  type?: HackathonType;
  minPrize?: number;
}

/**
 * Runs a cross-entity search. Everything is optional — the search can be driven
 * by `q`, by filters alone, or both; empty/absent values are simply omitted.
 */
export function searchAll(params: SearchParams): Promise<SearchResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  for (const skill of params.skills ?? []) qs.append("skills", skill);
  if (params.location) qs.set("location", params.location);
  if (params.type) qs.set("type", params.type);
  if (params.minPrize !== undefined) qs.set("minPrize", String(params.minPrize));
  return GET<SearchResult>(`/search?${qs.toString()}`);
}
