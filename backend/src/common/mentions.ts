/**
 * Extract `@username` mentions from free text (posts, comments, messages).
 *
 * Usernames follow the registration rules (`[a-zA-Z0-9_.-]`, 3–32 chars, see
 * auth `registerSchema`). The lookbehind keeps emails (`a@b.com`) and paths
 * (`foo/@bar`) from matching, and trailing sentence punctuation (`@ana.`) is
 * trimmed so the period isn't swallowed into the handle.
 *
 * Returns a de-duplicated list of **lowercased** usernames; resolving them to
 * real accounts (and dropping invalid ones) is the caller's job.
 */
const MENTION_RE = /(?<![\w@./-])@([a-zA-Z0-9_.-]{3,33})/g;

export function extractMentions(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(MENTION_RE)) {
    const handle = m[1].replace(/[.-]+$/, ""); // drop trailing . / -
    if (handle.length >= 3) out.add(handle.toLowerCase());
  }
  return [...out];
}
