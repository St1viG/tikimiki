"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { FeedPost } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { PostAuthor } from "@/components/PostAuthor";
import { PostMedia } from "@/components/PostMedia";
import { MarkdownContent } from "@/components/MarkdownContent";
import { useAuth } from "@/components/auth/AuthProvider";
import { useT, useLanguage } from "@/components/i18n/LanguageProvider";
import { deletePost, updatePost } from "@/lib/api";

/**
 * PostCard — the single, shared rendering of a post used everywhere a post
 * appears (home feed list, the post-detail modal, and a profile's posts tab).
 *
 * It is self-contained: it owns the author's own-post controls — the corner
 * "⋯" menu (edit / delete), the inline markdown editor (same toolbar as the
 * composer), and the in-app delete confirmation — and persists those via the
 * API itself, notifying the parent through `onEdited` / `onDeleted` so the
 * parent can update its list. Engagement that must stay in sync across the list
 * and the modal (likes) is lifted to the parent via `liked` + `onToggleLike`.
 *
 * Layout/behaviour varies by surface through props: `clickable` + `onOpenDetail`
 * (feed list opens the modal), `stackedAuthor` (modal head), `headExtra` (the
 * feed's follow button), `onComment` (button vs. static count), `onShare`, and
 * the media display flags.
 */

const M = {
  postOptions:   { en: "Post options",  sr: "Opcije objave" },
  editPost:      { en: "Edit",          sr: "Izmeni" },
  deletePost:    { en: "Delete",        sr: "Obriši" },
  deleteTitle:   { en: "Delete post?",  sr: "Obrisati objavu?" },
  deleteConfirm: { en: "This post will be permanently removed. This action can't be undone.", sr: "Ova objava će biti trajno uklonjena. Ova radnja se ne može poništiti." },
  deleting:      { en: "Deleting…",     sr: "Brisanje…" },
  editedLabel:   { en: "(Edited)",      sr: "(Izmenjeno)" },
  saveEdit:      { en: "Save",          sr: "Sačuvaj" },
  saving:        { en: "Saving…",       sr: "Čuvanje…" },
  cancelEdit:    { en: "Cancel",        sr: "Otkaži" },
  like:          { en: "Like",          sr: "Sviđa mi se" },
  comments:      { en: "Comments",      sr: "Komentari" },
  share:         { en: "Share",         sr: "Podeli" },
  linkCopied:    { en: "Link copied",   sr: "Link kopiran" },
  mdBold:        { en: "Bold",          sr: "Podebljano" },
  mdItalic:      { en: "Italic",        sr: "Kurziv" },
  mdH1:          { en: "Large heading", sr: "Veliki naslov" },
  mdH2:          { en: "Medium heading", sr: "Srednji naslov" },
  mdH3:          { en: "Small heading", sr: "Mali naslov" },
  mdList:        { en: "Bulleted list", sr: "Lista" },
  mdQuote:       { en: "Quote",         sr: "Citat" },
  mdCode:        { en: "Code",          sr: "Kôd" },
  mdLink:        { en: "Link",          sr: "Link" },
} as const;

const MAX_LEN = 5000; // matches the backend content limit

// Markdown toolbar groups (headings · emphasis · blocks/inline). `opts` is the
// action applied to the editor's textarea at the current selection.
const MD_GROUPS = [
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
    { key: "mdCode", label: <span className="md-code">{"</>"}</span>, opts: { wrap: ["`", "`"] } },
    { key: "mdLink", label: <Icon name="link" />, opts: { wrap: ["[", "](url)"] } },
  ],
] as const;

export interface PostCardProps {
  post: FeedPost;
  liked: boolean;
  onToggleLike: (postId: string) => void;
  onOpenProfile: (username: string) => void;
  /** Called with the updated post after a successful inline edit. */
  onEdited?: (post: FeedPost) => void;
  /** Called with the post id after a successful delete. */
  onDeleted?: (postId: string) => void;
  /** When true (+ onOpenDetail), clicking empty card area opens the detail view. */
  clickable?: boolean;
  onOpenDetail?: (postId: string) => void;
  /** Stacked author head layout (used in the detail modal). */
  stackedAuthor?: boolean;
  /** Trailing head controls (e.g. the feed's follow button). */
  headExtra?: React.ReactNode;
  /** When set, the comment action is a button (opens the thread); else static. */
  onComment?: (postId: string) => void;
  /** When set, renders a share button. */
  onShare?: (post: FeedPost) => void;
  shareCopied?: boolean;
  mediaLightbox?: boolean;
  mediaMaxHeight?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function PostCard({
  post,
  liked,
  onToggleLike,
  onOpenProfile,
  onEdited,
  onDeleted,
  clickable = false,
  onOpenDetail,
  stackedAuthor = false,
  headExtra,
  onComment,
  onShare,
  shareCopied = false,
  mediaLightbox = false,
  mediaMaxHeight,
  style,
  className = "",
}: PostCardProps) {
  const t = useT(M);
  const { locale } = useLanguage();
  const { user } = useAuth();

  const isOwn = !!user && post.authorId === user.userId;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.content);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editTextRef = useRef<HTMLTextAreaElement>(null);

  // Close the "⋯" menu on any outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".post-menu")) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Escape closes the confirm dialog (unless a delete is in flight).
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) setConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen, deleting]);

  const startEdit = () => {
    setMenuOpen(false);
    setEditDraft(post.content);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditDraft(post.content);
  };

  const saveEdit = async () => {
    const content = editDraft.trim();
    if (savingEdit || (!content && (post.attachments?.length ?? 0) === 0)) return;
    setSavingEdit(true);
    try {
      const urls = (post.attachments ?? []).map((a) => a.url);
      const updated = await updatePost(post.postId, content, urls);
      onEdited?.({ ...post, content: updated.content, editedAt: updated.editedAt });
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deletePost(post.postId);
      onDeleted?.(post.postId);
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Apply a markdown action to the editor textarea at its current selection.
  const applyMd = (opts: { wrap?: readonly [string, string]; linePrefix?: string }) => {
    const ta = editTextRef.current;
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
      caretStart = start + open.length;
      caretEnd = caretStart + selected.length;
    } else if (opts.linePrefix) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      next = value.slice(0, lineStart) + opts.linePrefix + value.slice(lineStart);
      caretStart = caretEnd = start + opts.linePrefix.length;
    }
    setEditDraft(next.slice(0, MAX_LEN));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretStart, caretEnd);
    });
  };

  // Clicking empty card area opens the detail view (not interactive children,
  // not while editing, and not during a text selection).
  const onCardClick = (e: React.MouseEvent) => {
    if (!clickable || !onOpenDetail || editing) return;
    if (window.getSelection()?.toString()) return;
    if ((e.target as HTMLElement).closest("button, a, [role='button'], input, textarea")) return;
    onOpenDetail(post.postId);
  };

  const menu = isOwn ? (
    <div className="post-menu">
      <button
        type="button"
        className="post-menu-btn"
        aria-label={t("postOptions")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={deleting}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {menuOpen && (
        <div className="post-menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={startEdit}>
            <Icon name="edit" /> {t("editPost")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
          >
            <Icon name="trash" /> {t("deletePost")}
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <article
        className={`post${clickable ? " post-clickable" : ""}${className ? ` ${className}` : ""}`}
        style={style}
        onClick={clickable ? onCardClick : undefined}
      >
        <div className="post-head">
          <PostAuthor
            username={post.authorUsername}
            displayName={post.authorDisplayName}
            avatarUrl={post.authorAvatarUrl}
            createdAt={post.createdAt}
            editedAt={post.editedAt}
            editedLabel={t("editedLabel")}
            locale={locale}
            onOpenProfile={onOpenProfile}
            stacked={stackedAuthor}
          />
          {(headExtra || menu) && (
            <div className="post-head-actions">
              {headExtra}
              {menu}
            </div>
          )}
        </div>

        {editing ? (
          <div className="post-edit">
            <div className="md-tools post-edit-tools">
              {MD_GROUPS.map((group, gi) => (
                <Fragment key={gi}>
                  {gi > 0 && <span className="md-sep" aria-hidden="true" />}
                  {group.map((tool) => (
                    <button
                      key={tool.key}
                      type="button"
                      className="md-btn"
                      title={t(tool.key)}
                      aria-label={t(tool.key)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyMd(tool.opts)}
                    >
                      {tool.label}
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>
            <textarea
              ref={editTextRef}
              className="post-edit-text"
              value={editDraft}
              maxLength={MAX_LEN}
              autoFocus
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <div className="post-edit-bar">
              <button className="btn btn-ghost" onClick={cancelEdit} disabled={savingEdit}>
                {t("cancelEdit")}
              </button>
              <button
                className="btn btn-violet"
                onClick={saveEdit}
                disabled={savingEdit || (editDraft.trim() === "" && (post.attachments?.length ?? 0) === 0)}
              >
                {savingEdit ? t("saving") : t("saveEdit")}
              </button>
            </div>
          </div>
        ) : (
          post.content && (
            <div className="post-body">
              <MarkdownContent>{post.content}</MarkdownContent>
            </div>
          )
        )}

        {post.attachments && post.attachments.length > 0 && (
          <PostMedia items={post.attachments} lightbox={mediaLightbox} maxHeight={mediaMaxHeight} />
        )}

        <div className="post-actions">
          <button
            className="act"
            aria-pressed={liked || undefined}
            aria-label={t("like")}
            onClick={() => onToggleLike(post.postId)}
          >
            <Icon name={liked ? "like-fill" : "like"} className="heart" />{" "}
            <span>{post.reactionCount}</span>
          </button>
          {onComment ? (
            <button className="act" aria-label={t("comments")} onClick={() => onComment(post.postId)}>
              <Icon name="comment" /> <span>{post.commentCount}</span>
            </button>
          ) : (
            <span className="act" aria-label={t("comments")}>
              <Icon name="comment" /> <span>{post.commentCount}</span>
            </span>
          )}
          {onShare && (
            <button className="act share" aria-label={t("share")} onClick={() => onShare(post)}>
              <Icon name="share" />
              {shareCopied && <span className="share-copied">{t("linkCopied")}</span>}
            </button>
          )}
        </div>
      </article>

      {confirmOpen && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`confirm-del-${post.postId}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirmOpen(false);
          }}
        >
          <div className="confirm-box">
            <div className="confirm-ic" aria-hidden="true">
              <Icon name="trash" />
            </div>
            <h2 className="confirm-title" id={`confirm-del-${post.postId}`}>
              {t("deleteTitle")}
            </h2>
            <p className="confirm-desc">{t("deleteConfirm")}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                {t("cancelEdit")}
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? t("deleting") : t("deletePost")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PostCard;
