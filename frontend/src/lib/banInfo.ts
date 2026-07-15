/**
 * Ban-info handoff between the login page and /suspended (SSU21).
 *
 * A banned login attempt returns 403 with { banned, reason, bannedAt,
 * expiresAt }. LoginClient stores that here and redirects to /suspended,
 * which reads it back to show the real reason and unlock date instead of
 * hardcoded fixtures. sessionStorage on purpose: the info is per-tab and
 * gone once the browser session ends.
 *
 * Autor: Dimitrije Pesic (2023/0014)
 */

export interface StoredBanInfo {
  reason: string | null;
  /** ISO timestamp the ban was issued at. */
  bannedAt: string | null;
  /** ISO timestamp the ban expires at; null = permanent. */
  expiresAt: string | null;
  /** Email/username used at login — prefills the appeal form on /suspended. */
  identifier: string | null;
}

const KEY = "tikimiki_ban_info";

export function storeBanInfo(info: StoredBanInfo): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    /* storage unavailable (private mode) — /suspended falls back to generic copy */
  }
}

export function readBanInfo(): StoredBanInfo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredBanInfo>;
    return {
      reason: p.reason ?? null,
      bannedAt: p.bannedAt ?? null,
      expiresAt: p.expiresAt ?? null,
      identifier: p.identifier ?? null,
    };
  } catch {
    return null;
  }
}
