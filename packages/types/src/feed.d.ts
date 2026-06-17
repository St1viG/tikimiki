/** Shapes for the home feed (F-17). */
export interface PostMedia {
    url: string;
    type: "image" | "video";
}
export interface FeedPost {
    postId: string;
    authorId: string;
    authorUsername: string;
    authorDisplayName?: string | null;
    authorAvatarUrl?: string | null;
    content: string;
    attachments?: PostMedia[];
    createdAt: string;
    reactionCount: number;
    commentCount: number;
}
export interface CreatePostBody {
    content: string;
}
