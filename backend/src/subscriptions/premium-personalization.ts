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

import { getTableName, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/** True when the avatar is an animated GIF — a Premium-only personalization. */
export function isGifAvatar(avatarUrl: string | null): boolean {
  return avatarUrl != null && /\.gif$/i.test(avatarUrl);
}

/**
 * SQL variant of the gate for list queries that join the users table: selects
 * the avatar as-is unless it is a GIF owned by someone without an active
 * Premium subscription, in which case it selects NULL. Use this instead of a
 * bare `users.avatarUrl` in any DTO the client renders.
 */
export function gatedAvatarUrl(ownerId: PgColumn, avatarUrl: PgColumn): SQL<string | null> {
  // The owner column must be qualified by hand: in a single-table select
  // drizzle renders a bare `${ownerId}` as just `"user_id"`, and inside the
  // EXISTS subquery that unqualified name binds to `s` (subscriptions), turning
  // the correlation into the tautology `s.user_id = s.user_id` — the gate then
  // passes GIFs through whenever ANY active subscription exists.
  const owner = sql`${sql.identifier(getTableName(ownerId.table))}.${sql.identifier(ownerId.name)}`;
  return sql<string | null>`case
    when ${avatarUrl} ~* '\\.gif$' and not exists (
      select 1 from subscriptions s
      where s.user_id = ${owner}
        and s.status = 'active'
        and s.ends_at > now()
    ) then null
    else ${avatarUrl}
  end`;
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
