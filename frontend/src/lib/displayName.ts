/**
 * Identity display helpers. A user's "name" is their full display name when set,
 * otherwise their @username. Centralizes the rule so every surface (banners,
 * posts, member rows, popups) shows the same primary label.
 */

/** The primary label to show for a user: display name if present, else username. */
export function personName(u: {
  displayName?: string | null;
  username: string;
}): string {
  const d = u.displayName?.trim();
  return d ? d : u.username;
}
