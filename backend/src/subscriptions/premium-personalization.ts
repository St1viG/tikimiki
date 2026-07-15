/**
 * Display gate for Premium-only personalization (SSU19).
 *
 * Cancelling Premium no longer deletes the profile banner or the animated
 * GIF avatar — they stay in the database so a reactivation restores them.
 * Enforcement therefore moved to read time: every place that serves a user's
 * banner / avatar alongside a premium check hides them for non-premium
 * members (a static avatar is never Premium and always passes through).
 *
 * Autor: Dimitrije Pesic (2023/0014)
 */

/** True when the avatar is an animated GIF — a Premium-only personalization. */
export function isGifAvatar(avatarUrl: string | null): boolean {
  return avatarUrl != null && /\.gif$/i.test(avatarUrl);
}

/**
 * Return the row with Premium-only personalization blanked out for
 * non-premium members: the banner is always Premium, a GIF avatar too.
 * Premium members get the row back untouched.
 */
export function gatePremiumPersonalization<
  T extends { avatarUrl: string | null; bannerUrl: string | null },
>(row: T, isPremium: boolean): T {
  if (isPremium) return row;
  return {
    ...row,
    bannerUrl: null,
    avatarUrl: isGifAvatar(row.avatarUrl) ? null : row.avatarUrl,
  };
}
