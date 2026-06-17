import type { KeyboardEvent } from "react";
import { OrbArt } from "@/components/ui/OrbArt";
import { personName } from "@/lib/displayName";
import { relTime, type Locale } from "@/lib/format";

/**
 * PostAuthor — the shared author row for a post: avatar + display name (primary)
 * + muted @username + relative time, laid out inline (`who who-inline`).
 *
 * Clicking the avatar, name, or @username opens the author's profile popup
 * (from which "Open profile" navigates to their full page). The parent owns the
 * popup and passes `onOpenProfile(username)`.
 *
 * Used by both the home feed and the profile posts. `stacked` switches the
 * inline layout (name · @handle · time on one line, for the feed) to a stacked
 * one (name on top, "@handle · time" directly below — used in the post modal).
 * Render it as the first child of a `.post-head` element; callers may add
 * trailing controls (e.g. the feed's follow button) after it.
 */
export function PostAuthor({
  username,
  displayName,
  avatarUrl,
  createdAt,
  locale,
  onOpenProfile,
  stacked = false,
}: {
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  locale: Locale;
  onOpenProfile: (username: string) => void;
  stacked?: boolean;
}) {
  const name = personName({ displayName, username });
  const open = () => onOpenProfile(username);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  const avatar = (
    <span
      className="post-av-link"
      role="button"
      tabIndex={0}
      aria-label={name}
      onClick={open}
      onKeyDown={onKey}
    >
      <span className="avatar v is-orb" aria-hidden="true">
        <OrbArt url={avatarUrl} seed={username} />
      </span>
    </span>
  );
  const nameEl = (
    <span className="name" role="button" tabIndex={0} onClick={open} onKeyDown={onKey}>
      {name}
    </span>
  );
  const handleEl = (
    <span className="post-handle" role="button" tabIndex={0} onClick={open} onKeyDown={onKey}>
      @{username}
    </span>
  );
  const timeEl = <span className="time">{relTime(createdAt, locale)}</span>;

  if (stacked) {
    // name on top; @handle · time directly beneath it
    return (
      <>
        {avatar}
        <span className="who">
          {nameEl}
          <span className="post-substack">
            {handleEl}
            {timeEl}
          </span>
        </span>
      </>
    );
  }

  return (
    <>
      {avatar}
      <span className="who who-inline">
        {nameEl}
        {handleEl}
        {timeEl}
      </span>
    </>
  );
}

export default PostAuthor;
