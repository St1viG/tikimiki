/**
 * @-mention parsing shared by the plain-text renderer ({@link MentionText}) and
 * the Markdown linkifier (used by {@link MarkdownContent}).
 *
 * Mirrors the backend `extractMentions` rules: usernames are `[a-zA-Z0-9_.-]`,
 * 3–32 chars. The lookbehind keeps emails (`a@b.com`) and paths (`x/@y`) from
 * matching; trailing sentence punctuation (`@ana.`) is trimmed off the handle.
 */
export const MENTION_RE = /(?<![\w@./-])@([a-zA-Z0-9_.-]{3,33})/g;

export type MentionSegment =
  { type: "text"; value: string } | { type: "mention"; username: string; raw: string };

/** Split plain text into text + mention segments, trimming trailing . / - . */
export function splitMentions(text: string): MentionSegment[] {
  const segs: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    const handle = m[1].replace(/[.-]+$/, "");
    if (handle.length < 3) continue;
    if (start > last) segs.push({ type: "text", value: text.slice(last, start) });
    segs.push({ type: "mention", username: handle, raw: `@${handle}` });
    last = start + 1 + handle.length; // consume '@' + handle (trimmed tail stays text)
  }
  if (last < text.length) segs.push({ type: "text", value: text.slice(last) });
  return segs;
}

/** Whether `content` @-mentions `username` (case-insensitive). */
export function isUserMentioned(content: string, username: string | null | undefined): boolean {
  if (!username) return false;
  const target = username.toLowerCase();
  for (const m of content.matchAll(MENTION_RE)) {
    if (m[1].replace(/[.-]+$/, "").toLowerCase() === target) return true;
  }
  return false;
}

// Fenced or inline code — mentions inside code spans are left untouched.
const CODE_SPAN_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

/**
 * Rewrite `@username` into a Markdown link to the profile (`/u/username`) so
 * react-markdown renders it through the normal link path. Skips code spans.
 */
export function linkifyMentions(src: string): string {
  return src
    .split(CODE_SPAN_RE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(MENTION_RE, (raw, h: string) => {
            const handle = h.replace(/[.-]+$/, "");
            if (handle.length < 3) return raw;
            const tail = h.slice(handle.length); // trailing . / - kept as text
            return `[@${handle}](/u/${handle})${tail}`;
          }),
    )
    .join("");
}
