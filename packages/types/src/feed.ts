/** Shapes for the home feed (F-17). */

/** One image or video attached to a post. */
export interface PostMedia {
  url: string;
  type: "image" | "video";
}

export interface FeedPost {
  postId: string;
  authorId: string;
  authorUsername: string;
  /** Author's full display name when set; falls back to the username in the UI. */
  authorDisplayName?: string | null;
  /** Author's uploaded avatar URL, if any (else a generated avatar is shown). */
  authorAvatarUrl?: string | null;
  content: string;
  /** Ordered image/video attachments (0–10). */
  attachments?: PostMedia[];
  createdAt: string;
  /** Set when the post has been edited; null/undefined otherwise. */
  editedAt?: string | null;
  reactionCount: number;
  commentCount: number;
  /** Whether the requesting user has liked this post (false when anonymous). */
  likedByMe: boolean;
  /** Whether the requesting user follows this post's author (false when anonymous/self). */
  authorIsFollowing: boolean;
}

export interface CreatePostBody {
  content: string;
}
