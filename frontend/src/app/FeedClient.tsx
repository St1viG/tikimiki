"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FeedPost } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { OrbArt } from "@/components/ui/OrbArt";
import { useT, useLanguage } from "@/components/i18n/LanguageProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  type Comment,
  createComment,
  createPost,
  getComments,
  getFeed,
  togglePostLike,
  toggleCommentLike,
  toggleFollow,
  updateComment,
  deleteComment,
  uploadMedia,
  searchUsers,
  getPost,
} from "@/lib/api";
import { relTime } from "@/lib/format";
import { personName } from "@/lib/displayName";
import { ASPECTS, ASPECT_ORDER, snapAspectKey, type AspectKey } from "@/lib/aspect";
import { cropImageToRatio } from "@/lib/cropImage";
import { coverStyle } from "@/lib/coverCrop";
import { PostCard } from "@/components/PostCard";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ImageCropper } from "@/components/ImageCropper";
import { ProfilePopup } from "@/components/popups/ProfilePopup";
import { SharePopup } from "@/components/popups/SharePopup";
import { MentionText } from "@/components/mentions/MentionText";
import { MentionClickContext } from "@/components/mentions/MentionLink";
import { useMentionAutocomplete } from "@/components/mentions/useMentionAutocomplete";

/* FeedClient — the interactive home feed.
 *
 * User posts are data-driven (GET /api/v1/feed); the composer creates real posts
 * (POST /api/v1/posts) for any signed-in account (members + organizations) and
 * prepends them. The Explore tab shows every post; Following shows only posts
 * from followed accounts. Likes are persisted (POST /api/v1/posts/:id/like) with
 * an optimistic toggle reconciled from the LikeResult. Comments load on demand
 * (GET /api/v1/posts/:id/comments) and the inline composer posts via
 * POST /api/v1/posts/:id/comments.
 *
 * Supplies its own `<main className="feed" id="feed">`.
 */

const M = {
  feedLabel: { en: "Feed source", sr: "Izvor feeda" },
  tabExplore: { en: "Explore", sr: "Istraži" },
  tabFollowing: { en: "Following", sr: "Pratim" },
  composerPlaceholder: { en: "Share something…", sr: "Podeli nešto…" },
  addMedia: { en: "Media", sr: "Mediji" },
  removeMedia: { en: "Remove", sr: "Ukloni" },
  cropImage: { en: "Crop & position", sr: "Iseci i pomeri" },
  aspectRatio: { en: "Aspect ratio", sr: "Format slike" },
  ratioPortrait: { en: "Portrait", sr: "Uspravno" },
  ratioSquare: { en: "Square", sr: "Kvadrat" },
  ratioLandscape: { en: "Landscape", sr: "Položeno" },
  cropHint: { en: "Drag the image to reposition", sr: "Prevuci sliku da je pomeriš" },
  cropDone: { en: "Done", sr: "Gotovo" },
  mdBold: { en: "Bold", sr: "Podebljano" },
  mdItalic: { en: "Italic", sr: "Kurziv" },
  mdH1: { en: "Large heading", sr: "Veliki naslov" },
  mdH2: { en: "Medium heading", sr: "Srednji naslov" },
  mdH3: { en: "Small heading", sr: "Mali naslov" },
  mdList: { en: "Bulleted list", sr: "Lista" },
  mdQuote: { en: "Quote", sr: "Citat" },
  mdCode: { en: "Code", sr: "Kôd" },
  mdLink: { en: "Link", sr: "Link" },
  preview: { en: "Preview", sr: "Pregled" },
  editPost: { en: "Edit", sr: "Izmeni" },
  nothingToPreview: {
    en: "Nothing to preview yet — start writing.",
    sr: "Još nema šta da se pregleda — počni da pišeš.",
  },
  post: { en: "Post", sr: "Objavi" },
  posting: { en: "Posting…", sr: "Objavljivanje…" },
  loading: { en: "Loading…", sr: "Učitavanje…" },
  like: { en: "Like", sr: "Sviđa mi se" },
  follow: { en: "Follow", sr: "Zaprati" },
  followingBtn: { en: "Following", sr: "Pratiš" },
  close: { en: "Close", sr: "Zatvori" },
  postDetail: { en: "Post", sr: "Objava" },
  openPost: { en: "Open post", sr: "Otvori objavu" },
  commentPlaceholder: { en: "Write a comment…", sr: "Napiši komentar…" },
  reply: { en: "Reply", sr: "Odgovori" },
  replyBtn: { en: "Reply", sr: "Odgovori" },
  replyingTo: { en: "Replying to", sr: "Odgovaraš na" },
  cancelReply: { en: "Cancel reply", sr: "Otkaži odgovor" },
  noComments: { en: "No comments yet.", sr: "Još nema komentara." },
  cmtOptions: { en: "Comment options", sr: "Opcije komentara" },
  editCmt: { en: "Edit", sr: "Izmeni" },
  deleteCmt: { en: "Delete", sr: "Obriši" },
  saveCmt: { en: "Save", sr: "Sačuvaj" },
  savingCmt: { en: "Saving…", sr: "Čuvanje…" },
  cancelCmt: { en: "Cancel", sr: "Otkaži" },
  editedLabel: { en: "(Edited)", sr: "(Izmenjeno)" },
  deleteCmtTitle: { en: "Delete comment?", sr: "Obrisati komentar?" },
  deleteCmtDesc: {
    en: "This comment will be permanently removed. This action can't be undone.",
    sr: "Komentar će biti trajno uklonjen. Ova radnja se ne može poništiti.",
  },
  deletingCmt: { en: "Deleting…", sr: "Brisanje…" },
} as const;

type Tab = "explore" | "following";

/** A media item being composed into a new post. Images are cropped to the post's
 *  aspect ratio and uploaded on Post (not on pick), so the focal point chosen in
 *  the cropper is baked into the uploaded file. */
type MediaDraft = {
  id: string;
  type: "image" | "video";
  file: File;
  previewUrl: string; // local object URL for the thumbnail / cropper
  ratio: number; // natural width/height (for the cropper's pan math)
  focalX: number; // 0..1 object-position fraction
  focalY: number; // 0..1
  zoom: number; // >= 1, magnification inside the frame
};

const MAX_MEDIA = 10;
const MAX_LEN = 5000; // matches the backend content limit

const ratioLabelKey: Record<AspectKey, "ratioPortrait" | "ratioSquare" | "ratioLandscape"> = {
  portrait: "ratioPortrait",
  square: "ratioSquare",
  landscape: "ratioLandscape",
};

export function FeedClient() {
  const t = useT(M);
  const { locale } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("explore");

  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  // Media attached to the new post (uploaded as picked, max 10).
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  // Opening the OS file dialog blurs the composer; this flag keeps that blur
  // from collapsing it (the user is mid-attach, not walking away).
  const pickingMediaRef = useRef(false);
  const composerTextRef = useRef<HTMLTextAreaElement>(null);
  // The post's aspect ratio (all attachments share it); auto-set from the first
  // image, changeable in the cropper. `cropId` is the image being repositioned.
  const [postRatio, setPostRatio] = useState<AspectKey>("portrait");
  const [cropId, setCropId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  // Author ids the viewer follows (seeded from authorIsFollowing) + in-flight follow ids.
  const [followedAuthors, setFollowedAuthors] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<Set<string>>(new Set());

  // A post opens in a focused detail modal (post + scrollable comments), like
  // Twitter/Instagram. `comments` caches each post's fetched thread (undefined =
  // not loaded, null = loading); `commentDrafts` holds each composer's text.
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[] | null>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentingOn, setCommentingOn] = useState<string | null>(null);
  // Comment ids the viewer has liked (seeded from likedByMe on load).
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  // Which comment the viewer is currently replying to (drives the banner + parentCommentId).
  const [replyToComment, setReplyToComment] = useState<{
    commentId: string;
    username: string;
    displayName?: string | null;
  } | null>(null);
  // Inline comment editing: which comment is open in the editor + its draft text.
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  // Comment id with a save/delete request in flight (disables its controls).
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  // Comment id awaiting delete confirmation (drives the shared confirm modal).
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<string | null>(null);
  // Comment id whose "⋯" actions menu is open.
  const [commentMenuOpen, setCommentMenuOpen] = useState<string | null>(null);
  // Author whose profile popup is open (clicked from a post/comment avatar/name/handle).
  const [popupUser, setPopupUser] = useState<string | null>(null);
  // Post whose share sheet (copy link / send to friends) is open.
  const [shareTarget, setShareTarget] = useState<FeedPost | null>(null);
  const searchParams = useSearchParams();
  const onProfileKey = (e: React.KeyboardEvent, u: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPopupUser(u);
    }
  };

  // @-mention autocomplete for the post composer (searches all users).
  const composerMention = useMentionAutocomplete({
    inputRef: composerTextRef,
    value: draft,
    setValue: setDraft,
    search: (q) => searchUsers(q),
    placement: "down",
  });
  // @-mention autocomplete for the (single) open comment composer.
  const commentInputRef = useRef<HTMLInputElement>(null);
  const commentMention = useMentionAutocomplete({
    inputRef: commentInputRef,
    value: openPostId ? (commentDrafts[openPostId] ?? "") : "",
    setValue: (v) => {
      if (openPostId) setCommentDrafts((d) => ({ ...d, [openPostId]: v }));
    },
    search: (q) => searchUsers(q),
    enabled: openPostId !== null,
  });

  // Clear reply context whenever the modal is closed.
  useEffect(() => {
    if (openPostId === null) setReplyToComment(null);
  }, [openPostId]);

  // Escape closes the comment delete-confirm dialog (unless a delete is running).
  useEffect(() => {
    if (confirmDeleteComment == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && commentBusy == null) setConfirmDeleteComment(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDeleteComment, commentBusy]);

  // Close the comment "⋯" menu on any outside click or Escape.
  useEffect(() => {
    if (!commentMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".post-menu")) setCommentMenuOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommentMenuOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [commentMenuOpen]);

  // While the post-detail modal is open: lock background scroll and let Escape
  // close it — but only when no profile popup is layered on top (so Escape
  // dismisses the topmost layer first).
  useEffect(() => {
    if (openPostId === null) return;
    const onKey = (e: KeyboardEvent) => {
      // Let a layered profile popup take Escape first. (A PostCard's own
      // confirm dialog handles Escape itself and stops here via the popup.)
      if (e.key === "Escape" && popupUser === null) setOpenPostId(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openPostId, popupUser]);

  /** Open the share sheet for a post (copy link / send to friends). */
  const sharePost = (p: FeedPost) => setShareTarget(p);

  // Reconcile a post in the list after a PostCard edits or deletes it (the same
  // `posts` array backs both the list and the detail modal).
  const onPostEdited = (updated: FeedPost) =>
    setPosts((prev) => prev?.map((p) => (p.postId === updated.postId ? updated : p)) ?? prev);
  const onPostDeleted = (postId: string) => {
    setPosts((prev) => prev?.filter((p) => p.postId !== postId) ?? prev);
    setOpenPostId((id) => (id === postId ? null : id));
  };

  useEffect(() => {
    let cancelled = false;
    getFeed()
      .then((data) => {
        if (!cancelled) {
          setPosts(data);
          // Seed the heart state so liked posts show a filled heart on load.
          setLikedSet(new Set(data.filter((p) => p.likedByMe).map((p) => p.postId)));
          setFollowedAuthors(
            new Set(data.filter((p) => p.authorIsFollowing).map((p) => p.authorId)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep-link: /?post=<id> opens that post's detail modal (once per link).
  useEffect(() => {
    const pid = searchParams.get("post");
    if (!pid) return;
    setOpenPostId(pid);
    loadComments(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // …and pull the shared post into the list if it isn't on this feed page, so
  // the detail modal (which reads from `posts`) can render it.
  useEffect(() => {
    const pid = searchParams.get("post");
    if (!pid || posts === null || posts.some((p) => p.postId === pid)) return;
    let cancelled = false;
    getPost(pid)
      .then((p) => {
        if (!cancelled)
          setPosts((cur) =>
            cur && cur.some((x) => x.postId === p.postId) ? cur : [p, ...(cur ?? [])],
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [searchParams, posts]);

  // Optimistically flip the heart, then reconcile the count from the server's
  // LikeResult (and revert the heart on failure).
  const toggleLike = async (id: string) => {
    const wasLiked = likedSet.has(id);
    setLikedSet((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      const result = await togglePostLike(id);
      setLikedSet((prev) => {
        const next = new Set(prev);
        result.liked ? next.add(id) : next.delete(id);
        return next;
      });
      setPosts(
        (prev) =>
          prev?.map((p) => (p.postId === id ? { ...p, reactionCount: result.reactionCount } : p)) ??
          prev,
      );
    } catch (err) {
      console.error(err);
      setLikedSet((prev) => {
        const next = new Set(prev);
        wasLiked ? next.add(id) : next.delete(id);
        return next;
      });
    }
  };

  // Toggle a post's comment thread open/closed; lazily fetch on first open.
  // Load a post's comments once (no-op if already loading/loaded).
  const loadComments = (postId: string) => {
    if (comments[postId] !== undefined) return;
    setComments((c) => ({ ...c, [postId]: null }));
    getComments(postId)
      .then((list) => {
        setComments((c) => ({ ...c, [postId]: list }));
        // Reconcile the post's badge with the authoritative thread (server
        // returns non-deleted comments, replies included) so it can't drift from
        // the optimistic ±1 math done on create/delete.
        setPosts(
          (prev) =>
            prev?.map((p) => (p.postId === postId ? { ...p, commentCount: list.length } : p)) ??
            prev,
        );
        setLikedComments((prev) => {
          const next = new Set(prev);
          for (const c of list) if (c.likedByMe) next.add(c.commentId);
          return next;
        });
      })
      .catch((err) => {
        console.error(err);
        setComments((c) => ({ ...c, [postId]: [] }));
      });
  };

  // Open the post-detail modal and ensure its comments are loaded. (PostCard
  // handles the "click empty card area to open" behavior via onOpenDetail.)
  const openPostModal = (postId: string) => {
    setOpenPostId(postId);
    loadComments(postId);
  };

  // Matches a leading "@handle " token so switching/cancelling a reply target
  // doesn't stack mentions in the composer.
  const LEADING_TAG = /^@[a-zA-Z0-9_.-]+\s+/;

  // Start a reply: tag the author in the composer (so they get pinged + it's
  // clear who you're answering) and remember the parent for threading.
  const startReply = (postId: string, c: Comment) => {
    setReplyToComment({
      commentId: c.commentId,
      username: c.authorUsername,
      displayName: c.authorDisplayName,
    });
    setCommentDrafts((d) => ({
      ...d,
      [postId]: `@${c.authorUsername} ${(d[postId] ?? "").replace(LEADING_TAG, "")}`,
    }));
    requestAnimationFrame(() => {
      const el = commentInputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  // Cancel a reply: drop the parent link and strip the leading @tag.
  const cancelReply = (postId: string) => {
    setReplyToComment(null);
    setCommentDrafts((d) => ({
      ...d,
      [postId]: (d[postId] ?? "").replace(LEADING_TAG, ""),
    }));
  };

  const handleComment = async (postId: string) => {
    const content = (commentDrafts[postId] ?? "").trim();
    if (!content || !user || commentingOn) return;
    setCommentingOn(postId);
    const parentCommentId = replyToComment?.commentId;
    try {
      const created = await createComment(postId, content, parentCommentId);
      setComments((c) => ({ ...c, [postId]: [...(c[postId] ?? []), created] }));
      setCommentDrafts((d) => ({ ...d, [postId]: "" }));
      setReplyToComment(null);
      setPosts(
        (prev) =>
          prev?.map((p) =>
            p.postId === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
          ) ?? prev,
      );
    } catch (err) {
      console.error(err);
    } finally {
      setCommentingOn(null);
    }
  };

  const toggleFollowAuthor = async (authorId: string) => {
    if (followBusy.has(authorId)) return;
    setFollowBusy((prev) => new Set(prev).add(authorId));
    try {
      const r = await toggleFollow(authorId);
      setFollowedAuthors((prev) => {
        const n = new Set(prev);
        r.following ? n.add(authorId) : n.delete(authorId);
        return n;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setFollowBusy((prev) => {
        const n = new Set(prev);
        n.delete(authorId);
        return n;
      });
    }
  };

  const toggleCommentLikeFn = async (postId: string, commentId: string) => {
    const wasLiked = likedComments.has(commentId);
    setLikedComments((prev) => {
      const n = new Set(prev);
      wasLiked ? n.delete(commentId) : n.add(commentId);
      return n;
    });
    try {
      const r = await toggleCommentLike(commentId);
      setComments((c) => ({
        ...c,
        [postId]: (c[postId] ?? []).map((cm) =>
          cm.commentId === commentId ? { ...cm, reactionCount: r.reactionCount } : cm,
        ),
      }));
      setLikedComments((prev) => {
        const n = new Set(prev);
        r.liked ? n.add(commentId) : n.delete(commentId);
        return n;
      });
    } catch (err) {
      console.error(err);
      setLikedComments((prev) => {
        const n = new Set(prev);
        wasLiked ? n.add(commentId) : n.delete(commentId);
        return n;
      });
    }
  };

  const startCommentEdit = (c: Comment) => {
    setConfirmDeleteComment(null);
    setEditingComment(c.commentId);
    setCommentEditDraft(c.content);
  };
  const cancelCommentEdit = () => {
    setEditingComment(null);
    setCommentEditDraft("");
  };

  // Save an inline comment edit. Author-only on the backend; stamps editedAt.
  const saveCommentEdit = async (postId: string, commentId: string) => {
    const content = commentEditDraft.trim();
    if (!content || commentBusy) return;
    setCommentBusy(commentId);
    try {
      const updated = await updateComment(commentId, content);
      setComments((c) => ({
        ...c,
        [postId]: (c[postId] ?? []).map((cm) =>
          cm.commentId === commentId
            ? { ...cm, content: updated.content, editedAt: updated.editedAt }
            : cm,
        ),
      }));
      setEditingComment(null);
      setCommentEditDraft("");
    } catch (err) {
      console.error(err);
    } finally {
      setCommentBusy(null);
    }
  };

  // Delete the viewer's own comment. The backend cascade soft-deletes this
  // comment AND its reply subtree, so we drop the whole subtree locally and
  // decrement the badge by the server's authoritative deletedCount.
  const deleteCommentFn = async (postId: string, commentId: string) => {
    if (commentBusy) return;
    setCommentBusy(commentId);
    try {
      const { deletedCount } = await deleteComment(commentId);
      setComments((c) => {
        const thread = c[postId] ?? [];
        // Collect the deleted comment + every descendant reply.
        const removed = new Set<string>([commentId]);
        for (let grew = true; grew;) {
          grew = false;
          for (const cm of thread) {
            if (
              cm.parentCommentId &&
              removed.has(cm.parentCommentId) &&
              !removed.has(cm.commentId)
            ) {
              removed.add(cm.commentId);
              grew = true;
            }
          }
        }
        return { ...c, [postId]: thread.filter((cm) => !removed.has(cm.commentId)) };
      });
      setConfirmDeleteComment(null);
      if (editingComment === commentId) cancelCommentEdit();
      setPosts(
        (prev) =>
          prev?.map((p) =>
            p.postId === postId
              ? { ...p, commentCount: Math.max(0, p.commentCount - deletedCount) }
              : p,
          ) ?? prev,
      );
    } catch (err) {
      console.error(err);
    } finally {
      setCommentBusy(null);
    }
  };

  // Pick image/video files: add up to MAX_MEDIA. Images are cropped + uploaded
  // on Post, so here we just hold the File and measure each image's ratio (for
  // the cropper). The first image picked sets the post's aspect ratio.
  const onPickMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickingMediaRef.current = false;
    // Keep the composer expanded so the picked thumbnails are visible at once.
    setComposerOpen(true);
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    const room = MAX_MEDIA - media.length;
    const startEmpty = media.length === 0;
    files.slice(0, Math.max(0, room)).forEach((file, i) => {
      const id = `${Date.now()}-${Math.round(performance.now())}-${i}-${file.name}`;
      const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      const previewUrl = URL.createObjectURL(file);
      setMedia((prev) => [
        ...prev,
        { id, type, file, previewUrl, ratio: 1, focalX: 0.5, focalY: 0.5, zoom: 1 },
      ]);
      if (type === "image") {
        const img = new window.Image();
        img.onload = () => {
          const r = img.naturalWidth / img.naturalHeight;
          setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, ratio: r } : m)));
          // Default the post's frame to the first image's nearest allowed ratio.
          if (startEmpty && i === 0) setPostRatio(snapAspectKey(r));
        };
        img.src = previewUrl;
      }
    });
  };

  const removeMedia = (id: string) => {
    setMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((m) => m.id !== id);
    });
  };

  // Resize the composer textarea to fit its content (after a programmatic edit).
  const autoGrow = () => {
    const ta = composerTextRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 340)}px`;
  };

  // Leaving preview remounts the textarea at its default height — re-grow it so
  // the full draft stays visible instead of snapping back to one line.
  useEffect(() => {
    if (!preview) autoGrow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  // Apply a markdown edit to a textarea at its current selection, writing the
  // result back via `setValue`. `wrap` surrounds the selection (bold/italic/
  // code/link); `linePrefix` prepends to the caret's line (heading/list/quote).
  // Shared by the composer and the inline post editor.
  const applyMdTo = (
    ta: HTMLTextAreaElement | null,
    setValue: (v: string) => void,
    opts: { wrap?: readonly [string, string]; linePrefix?: string },
    after?: () => void,
  ) => {
    if (!ta) return;
    const value = ta.value;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    let next = value;
    let caretStart = start;
    let caretEnd = end;

    if (opts.wrap) {
      const [open, close] = opts.wrap;
      const selected = value.slice(start, end);
      next = value.slice(0, start) + open + selected + close + value.slice(end);
      // Select the inner text so the user can keep typing / see what changed.
      caretStart = start + open.length;
      caretEnd = caretStart + selected.length;
    } else if (opts.linePrefix) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      next = value.slice(0, lineStart) + opts.linePrefix + value.slice(lineStart);
      caretStart = caretEnd = start + opts.linePrefix.length;
    }

    setValue(next.slice(0, MAX_LEN));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretStart, caretEnd);
      after?.();
    });
  };

  const applyMd = (opts: { wrap?: readonly [string, string]; linePrefix?: string }) =>
    applyMdTo(composerTextRef.current, setDraft, opts, autoGrow);

  // Toolbar buttons, in visual groups (headings · emphasis · blocks/inline).
  // `opts` is the markdown action; the composer and the post editor each bind it
  // to their own textarea.
  const mdGroups = [
    [
      { key: "mdH1", label: <span className="md-h">H1</span>, opts: { linePrefix: "# " } },
      { key: "mdH2", label: <span className="md-h">H2</span>, opts: { linePrefix: "## " } },
      { key: "mdH3", label: <span className="md-h">H3</span>, opts: { linePrefix: "### " } },
    ],
    [
      { key: "mdBold", label: <b>B</b>, opts: { wrap: ["**", "**"] } },
      { key: "mdItalic", label: <i>I</i>, opts: { wrap: ["_", "_"] } },
    ],
    [
      { key: "mdList", label: <Icon name="list" />, opts: { linePrefix: "- " } },
      { key: "mdQuote", label: <Icon name="quote" />, opts: { linePrefix: "> " } },
      {
        key: "mdCode",
        label: <span className="md-code">{"</>"}</span>,
        opts: { wrap: ["`", "`"] },
      },
      { key: "mdLink", label: <Icon name="link" />, opts: { wrap: ["[", "](url)"] } },
    ],
  ] as const;

  const handlePost = async () => {
    const content = draft.trim();
    if (!user || posting) return;
    if (!content && media.length === 0) return;
    setPosting(true);
    try {
      // Bake each image to the post's ratio at its focal point, then upload.
      // Videos upload as-is (display covers them to the same frame).
      const ratioVal = ASPECTS[postRatio];
      const urls: string[] = [];
      for (const m of media) {
        if (m.type === "image") {
          const blob = await cropImageToRatio(m.file, ratioVal, m.focalX, m.focalY, m.zoom);
          const name = m.file.name.replace(/\.[^.]+$/, "") + ".jpg";
          const { url } = await uploadMedia(new File([blob], name, { type: "image/jpeg" }));
          urls.push(url);
        } else {
          const { url } = await uploadMedia(m.file);
          urls.push(url);
        }
      }
      const created = await createPost(content, urls);
      setPosts((prev) => [created, ...(prev ?? [])]);
      setDraft("");
      setPreview(false);
      setComposerOpen(false);
      if (composerTextRef.current) composerTextRef.current.style.height = "auto";
      media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
      setMedia([]);
    } catch (err) {
      console.error(err);
    } finally {
      setPosting(false);
    }
  };

  // The comment thread + composer for a post (rendered inside the detail modal).
  const renderComments = (p: FeedPost) => {
    const thread = comments[p.postId];

    // Build a map for O(1) lookup and resolve which root a reply belongs to.
    const commentMap: Record<string, Comment> = {};
    if (thread) for (const c of thread) commentMap[c.commentId] = c;

    // Resolve the top-level (root) comment a reply belongs to. Robust to a
    // missing ancestor (e.g. an intermediate reply that was deleted): we stop at
    // the highest still-existing ancestor instead of returning a dangling id,
    // so orphaned replies keep rendering instead of vanishing.
    const getRootId = (commentId: string): string => {
      let cur = commentMap[commentId];
      let topId = commentId;
      const seen = new Set<string>();
      while (cur?.parentCommentId && !seen.has(cur.commentId)) {
        seen.add(cur.commentId);
        const parent = commentMap[cur.parentCommentId];
        if (!parent) break; // ancestor deleted/missing — anchor here
        topId = parent.commentId;
        cur = parent;
      }
      return topId;
    };

    const roots: Comment[] = [];
    const repliesByRoot: Record<string, Comment[]> = {};
    if (thread) {
      for (const c of thread) {
        if (!c.parentCommentId) {
          roots.push(c);
        } else {
          const rootId = getRootId(c.commentId);
          if (!repliesByRoot[rootId]) repliesByRoot[rootId] = [];
          repliesByRoot[rootId].push(c);
        }
      }
    }

    const renderCommentRow = (c: Comment, isReply = false) => {
      const cLiked = likedComments.has(c.commentId);
      const isTargeted = replyToComment?.commentId === c.commentId;
      const isOwnComment = !!user && c.authorId === user.userId;
      const isEditing = editingComment === c.commentId;
      const isBusy = commentBusy === c.commentId;
      return (
        <div className="post-head" key={c.commentId} style={{ alignItems: "flex-start" }}>
          <span
            className="post-av-link"
            role="button"
            tabIndex={0}
            aria-label={personName({
              displayName: c.authorDisplayName,
              username: c.authorUsername,
            })}
            onClick={() => setPopupUser(c.authorUsername)}
            onKeyDown={(e) => onProfileKey(e, c.authorUsername)}
          >
            <span className={`avatar${isReply ? " sm" : " v"} is-orb`} aria-hidden="true">
              <OrbArt url={c.authorAvatarUrl} seed={c.authorUsername} />
            </span>
          </span>
          <span className="who">
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                className="name"
                role="button"
                tabIndex={0}
                onClick={() => setPopupUser(c.authorUsername)}
                onKeyDown={(e) => onProfileKey(e, c.authorUsername)}
              >
                {personName({ displayName: c.authorDisplayName, username: c.authorUsername })}
              </span>
              <span
                className="post-handle"
                role="button"
                tabIndex={0}
                onClick={() => setPopupUser(c.authorUsername)}
                onKeyDown={(e) => onProfileKey(e, c.authorUsername)}
              >
                @{c.authorUsername}
              </span>
              <span className="time">{relTime(c.createdAt, locale)}</span>
              {c.editedAt && <span className="time">{t("editedLabel")}</span>}
              <button
                className="act"
                aria-pressed={cLiked || undefined}
                aria-label={t("like")}
                onClick={() => toggleCommentLikeFn(p.postId, c.commentId)}
                style={{ padding: 0 }}
              >
                <Icon name={cLiked ? "like-fill" : "like"} className="heart" />{" "}
                <span>{c.reactionCount}</span>
              </button>
              {user && !isEditing && (
                <button
                  className="act comment-reply-btn"
                  aria-label={t("replyBtn")}
                  aria-pressed={isTargeted || undefined}
                  onClick={() => (isTargeted ? cancelReply(p.postId) : startReply(p.postId, c))}
                  style={{ padding: 0, color: isTargeted ? "var(--violet-light)" : undefined }}
                >
                  ↩ {t("replyBtn")}
                </button>
              )}
              {isOwnComment && !isEditing && (
                <span className="post-menu">
                  <button
                    type="button"
                    className="post-menu-btn"
                    aria-label={t("cmtOptions")}
                    aria-haspopup="menu"
                    aria-expanded={commentMenuOpen === c.commentId}
                    disabled={isBusy}
                    onClick={() =>
                      setCommentMenuOpen((o) => (o === c.commentId ? null : c.commentId))
                    }
                    style={{ width: 26, height: 26 }}
                  >
                    <Icon name="more" />
                  </button>
                  {commentMenuOpen === c.commentId && (
                    <div className="post-menu-pop" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCommentMenuOpen(null);
                          startCommentEdit(c);
                        }}
                      >
                        <Icon name="edit" /> {t("editCmt")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="is-danger"
                        onClick={() => {
                          setCommentMenuOpen(null);
                          setConfirmDeleteComment(c.commentId);
                        }}
                      >
                        <Icon name="trash" /> {t("deleteCmt")}
                      </button>
                    </div>
                  )}
                </span>
              )}
            </span>
            {isEditing ? (
              <div className="post-edit" style={{ marginTop: 6 }}>
                <textarea
                  className="post-edit-text"
                  style={{ minHeight: 64 }}
                  value={commentEditDraft}
                  maxLength={MAX_LEN}
                  autoFocus
                  disabled={isBusy}
                  onChange={(e) => setCommentEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
                      saveCommentEdit(p.postId, c.commentId);
                    if (e.key === "Escape") cancelCommentEdit();
                  }}
                />
                <div className="post-edit-bar">
                  <button className="btn btn-ghost" onClick={cancelCommentEdit} disabled={isBusy}>
                    {t("cancelCmt")}
                  </button>
                  <button
                    className="btn btn-violet"
                    onClick={() => saveCommentEdit(p.postId, c.commentId)}
                    disabled={isBusy || commentEditDraft.trim() === ""}
                  >
                    {isBusy ? t("savingCmt") : t("saveCmt")}
                  </button>
                </div>
              </div>
            ) : (
              <span className="post-body">
                <MentionText>{c.content}</MentionText>
              </span>
            )}
          </span>
        </div>
      );
    };

    return (
      <>
        <div className="post-comments">
          {thread == null && (
            <p className="time" style={{ padding: "10px 4px" }}>
              {t("loading")}
            </p>
          )}
          {thread != null && thread.length === 0 && (
            <p className="time" style={{ padding: "10px 4px" }}>
              {t("noComments")}
            </p>
          )}

          {roots.map((c) => (
            <div key={c.commentId}>
              {renderCommentRow(c, false)}
              {repliesByRoot[c.commentId]?.length > 0 && (
                <div className="comment-replies">
                  {repliesByRoot[c.commentId].map((r) => renderCommentRow(r, true))}
                </div>
              )}
            </div>
          ))}

          {user && (
            <div
              className="composer"
              style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
                {commentMention.menu}
                <span className="avatar brand is-orb" aria-hidden="true">
                  <OrbArt url={user.avatarUrl} seed={user.username ?? "tikimiki"} />
                </span>
                <input
                  ref={commentInputRef}
                  className="field"
                  placeholder={t("commentPlaceholder")}
                  value={commentDrafts[p.postId] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCommentDrafts((d) => ({ ...d, [p.postId]: v }));
                    // Deleting the leading @tag cancels the reply (back to a
                    // top-level comment).
                    if (replyToComment && !v.startsWith(`@${replyToComment.username}`)) {
                      setReplyToComment(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (commentMention.onKeyDown(e)) return;
                    if (e.key === "Enter") handleComment(p.postId);
                  }}
                  disabled={commentingOn === p.postId}
                />
                <button
                  className="btn btn-violet"
                  onClick={() => handleComment(p.postId)}
                  disabled={
                    commentingOn === p.postId || (commentDrafts[p.postId] ?? "").trim() === ""
                  }
                >
                  {commentingOn === p.postId ? t("posting") : t("reply")}
                </button>
              </div>
            </div>
          )}
        </div>

        {confirmDeleteComment != null && (
          <div
            className="confirm-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-del-comment"
            onClick={(e) => {
              if (e.target === e.currentTarget && commentBusy == null)
                setConfirmDeleteComment(null);
            }}
          >
            <div className="confirm-box">
              <div className="confirm-ic" aria-hidden="true">
                <Icon name="trash" />
              </div>
              <h2 className="confirm-title" id="confirm-del-comment">
                {t("deleteCmtTitle")}
              </h2>
              <p className="confirm-desc">{t("deleteCmtDesc")}</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirmDeleteComment(null)}
                  disabled={commentBusy != null}
                >
                  {t("cancelCmt")}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => deleteCommentFn(p.postId, confirmDeleteComment)}
                  disabled={commentBusy != null}
                >
                  {commentBusy != null ? t("deletingCmt") : t("deleteCmt")}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const openPost = posts?.find((p) => p.postId === openPostId) ?? null;

  // Explore shows every post; Following shows only posts from accounts the
  // viewer follows (reflecting live follow/unfollow toggles via followedAuthors).
  const visiblePosts =
    tab === "following" ? (posts ?? []).filter((p) => followedAuthors.has(p.authorId)) : posts;

  return (
    <MentionClickContext.Provider value={setPopupUser}>
      <main className="feed" id="feed">
        <h1 className="sr-only">Feed</h1>

        <div className="feed-switch" role="tablist" aria-label={t("feedLabel")}>
          <button
            className="feed-tab"
            role="tab"
            aria-selected={tab === "explore"}
            onClick={() => setTab("explore")}
          >
            {t("tabExplore")}
          </button>
          <button
            className="feed-tab"
            role="tab"
            aria-selected={tab === "following"}
            onClick={() => setTab("following")}
          >
            {t("tabFollowing")}
          </button>
        </div>

        <div
          className="composer composer-rich reveal"
          style={{ "--i": 0 } as React.CSSProperties}
          onBlur={(e) => {
            // The OS file dialog steals focus while media is being attached —
            // consume that one blur instead of collapsing mid-pick.
            if (pickingMediaRef.current) return;
            // Collapse if focus leaves the entire composer area with an empty draft.
            if (
              !e.currentTarget.contains(e.relatedTarget as Node | null) &&
              !draft.trim() &&
              media.length === 0 &&
              !preview
            ) {
              setComposerOpen(false);
            }
          }}
        >
          <div className="composer-row" style={{ position: "relative" }}>
            {composerMention.menu}
            <span className="avatar brand is-orb" aria-hidden="true">
              <OrbArt url={user?.avatarUrl} seed={user?.username ?? "tikimiki"} />
            </span>
            {preview ? (
              <div className="field composer-text composer-preview">
                {draft.trim() ? (
                  <MarkdownContent>{draft}</MarkdownContent>
                ) : (
                  <span className="composer-preview-empty">{t("nothingToPreview")}</span>
                )}
              </div>
            ) : (
              <textarea
                ref={composerTextRef}
                className="field composer-text"
                placeholder={t("composerPlaceholder")}
                value={draft}
                maxLength={MAX_LEN}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // Grow to fit the content (capped by max-height in CSS).
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 340)}px`;
                }}
                onKeyDown={(e) => {
                  if (composerMention.onKeyDown(e)) return;
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handlePost();
                }}
                onFocus={() => setComposerOpen(true)}
                disabled={!user || posting}
                rows={1}
              />
            )}
          </div>

          {/* Advanced controls — always in the DOM, animated via grid-template-rows.
            grid 0fr→1fr avoids animating height directly (layout-safe). */}
          <div className={`composer-advanced${composerOpen ? " is-open" : ""}`}>
            <div className="composer-advanced-inner">
              {user && (
                <div className="composer-toolbar">
                  <div className="md-tools">
                    {mdGroups.map((group, gi) => (
                      <Fragment key={gi}>
                        {gi > 0 && <span className="md-sep" aria-hidden="true" />}
                        {group.map((tool) => (
                          <button
                            key={tool.key}
                            type="button"
                            className="md-btn"
                            title={t(tool.key)}
                            aria-label={t(tool.key)}
                            disabled={preview || posting}
                            // Keep the textarea selection while clicking the toolbar.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyMd(tool.opts)}
                          >
                            {tool.label}
                          </button>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`md-btn md-preview${preview ? " is-on" : ""}`}
                    onClick={() => setPreview((p) => !p)}
                  >
                    <Icon name={preview ? "edit" : "eye"} />
                    {preview ? t("editPost") : t("preview")}
                  </button>
                </div>
              )}

              {media.length > 0 && (
                <>
                  <div className="composer-ratios" role="group" aria-label={t("aspectRatio")}>
                    {ASPECT_ORDER.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`ratio-btn${postRatio === key ? " is-on" : ""}`}
                        onClick={() => setPostRatio(key)}
                      >
                        <span
                          className="ratio-ico"
                          style={{ aspectRatio: String(ASPECTS[key]) }}
                          aria-hidden="true"
                        />
                        {t(ratioLabelKey[key])}
                      </button>
                    ))}
                  </div>
                  <div className="composer-media">
                    {media.map((m) => (
                      <div
                        className="cm-thumb"
                        key={m.id}
                        style={{ aspectRatio: String(ASPECTS[postRatio]) }}
                      >
                        {m.type === "video" ? (
                          <video
                            className="cm-thumb-el"
                            src={m.previewUrl}
                            muted
                            style={{ objectPosition: `${m.focalX * 100}% ${m.focalY * 100}%` }}
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="cm-thumb-el"
                            src={m.previewUrl}
                            alt=""
                            draggable={false}
                            style={coverStyle(
                              m.ratio,
                              ASPECTS[postRatio],
                              m.focalX,
                              m.focalY,
                              m.zoom,
                            )}
                            onClick={() => setCropId(m.id)}
                          />
                        )}
                        {m.type === "image" && (
                          <button
                            type="button"
                            className="cm-crop"
                            aria-label={t("cropImage")}
                            title={t("cropImage")}
                            onClick={() => setCropId(m.id)}
                          >
                            <Icon name="crop" />
                          </button>
                        )}
                        {m.type === "video" && (
                          <span className="cm-vid-badge" aria-hidden="true">
                            ▶
                          </span>
                        )}
                        <button
                          type="button"
                          className="cm-remove"
                          aria-label={t("removeMedia")}
                          onClick={() => removeMedia(m.id)}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="composer-bar">
                {user && (
                  <>
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      hidden
                      onChange={onPickMedia}
                    />
                    <button
                      type="button"
                      className="composer-add"
                      onClick={() => {
                        pickingMediaRef.current = true;
                        // Dialog closed without picking (cancel) → drop the flag
                        // when the window gets focus back.
                        window.addEventListener(
                          "focus",
                          () => {
                            pickingMediaRef.current = false;
                          },
                          { once: true },
                        );
                        mediaInputRef.current?.click();
                      }}
                      disabled={posting || media.length >= MAX_MEDIA}
                    >
                      <Icon name="image" /> {t("addMedia")}
                      {media.length >= 8 && (
                        <span className="composer-add-count">
                          {media.length}/{MAX_MEDIA}
                        </span>
                      )}
                    </button>
                  </>
                )}
                {user && draft.length > MAX_LEN - 500 && (
                  <span
                    className={`composer-count${draft.length > MAX_LEN - 50 ? " is-warn" : ""}`}
                  >
                    {MAX_LEN - draft.length}
                  </span>
                )}
                {user ? (
                  <button
                    className="btn btn-violet composer-post"
                    onClick={handlePost}
                    disabled={posting || (draft.trim() === "" && media.length === 0)}
                  >
                    {posting ? t("posting") : t("post")}
                  </button>
                ) : (
                  <Link className="btn btn-violet composer-post composer-post-solo" href="/login">
                    {t("post")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {cropId &&
          (() => {
            const m = media.find((x) => x.id === cropId);
            if (!m) return null;
            return (
              <ImageCropper
                src={m.previewUrl}
                imgRatio={m.ratio}
                ratioKey={postRatio}
                onRatioKey={setPostRatio}
                focalX={m.focalX}
                focalY={m.focalY}
                zoom={m.zoom}
                onChange={(fx, fy, z) =>
                  setMedia((prev) =>
                    prev.map((x) =>
                      x.id === cropId ? { ...x, focalX: fx, focalY: fy, zoom: z } : x,
                    ),
                  )
                }
                onClose={() => setCropId(null)}
                hint={t("cropHint")}
                done={t("cropDone")}
              />
            );
          })()}

        {/* User posts — data-driven */}
        {posts === null &&
          ["a", "b", "c"].map((k) => (
            <article className="post" key={`post-skel-${k}`} aria-busy="true">
              <div className="post-head">
                <span className="avatar v is-orb skel skel-circle" aria-hidden="true" />
                <span className="who who-inline">
                  <span
                    className="skel skel-line"
                    style={{ width: "30%" } as React.CSSProperties}
                    aria-hidden="true"
                  />
                  <span
                    className="skel skel-line"
                    style={{ width: "18%", marginTop: 7 } as React.CSSProperties}
                    aria-hidden="true"
                  />
                </span>
              </div>
              <div className="post-body">
                <span
                  className="skel skel-line"
                  style={{ width: "92%" } as React.CSSProperties}
                  aria-hidden="true"
                />
                <span
                  className="skel skel-line"
                  style={{ width: "60%", marginTop: 8 } as React.CSSProperties}
                  aria-hidden="true"
                />
              </div>
              <div className="post-actions">
                {[0, 1, 2].map((a) => (
                  <span
                    key={a}
                    className="skel"
                    style={
                      {
                        width: 44,
                        height: 33,
                        borderRadius: 9,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  />
                ))}
              </div>
            </article>
          ))}
        {visiblePosts?.map((p, idx) => (
          <PostCard
            key={p.postId}
            post={p}
            liked={likedSet.has(p.postId)}
            onToggleLike={toggleLike}
            onOpenProfile={setPopupUser}
            onEdited={onPostEdited}
            onDeleted={onPostDeleted}
            clickable
            onOpenDetail={openPostModal}
            onComment={openPostModal}
            onShare={sharePost}
            className="reveal"
            style={{ "--i": idx + 3 } as React.CSSProperties}
            headExtra={
              user && p.authorId !== user.userId ? (
                <button
                  className={
                    followedAuthors.has(p.authorId)
                      ? "btn btn-ghost follow-btn"
                      : "btn btn-violet follow-btn"
                  }
                  style={{ padding: "4px 12px", fontSize: "0.8rem" }}
                  disabled={followBusy.has(p.authorId)}
                  onClick={() => toggleFollowAuthor(p.authorId)}
                >
                  {followedAuthors.has(p.authorId) ? t("followingBtn") : t("follow")}
                </button>
              ) : undefined
            }
          />
        ))}
      </main>
      {openPost && (
        <div
          className="pm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("postDetail")}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenPostId(null);
          }}
        >
          <div className="pm-modal">
            <button
              className="pm-close"
              onClick={() => setOpenPostId(null)}
              aria-label={t("close")}
            >
              <Icon name="x" />
            </button>
            <div className="pm-scroll">
              <PostCard
                post={openPost}
                liked={likedSet.has(openPost.postId)}
                onToggleLike={toggleLike}
                onOpenProfile={setPopupUser}
                onEdited={onPostEdited}
                onDeleted={onPostDeleted}
                stackedAuthor
                onShare={sharePost}
                mediaLightbox
                mediaMaxHeight="60vh"
              />
              {renderComments(openPost)}
            </div>
          </div>
        </div>
      )}
      <ProfilePopup
        open={popupUser !== null}
        username={popupUser}
        onClose={() => setPopupUser(null)}
      />
      <SharePopup
        post={shareTarget}
        open={shareTarget !== null}
        onClose={() => setShareTarget(null)}
      />
    </MentionClickContext.Provider>
  );
}

export default FeedClient;
