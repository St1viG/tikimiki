/**
 * Render helpers for equipped cosmetics.
 *
 * A cosmetic's `renderData` is a free-form hint object set in the store
 * catalogue; the conventions used so far:
 *  - username effects:      { glow: "#A78BFA" }           → neon glowing name
 *  - profile decorations:   { frame: "neon", glow: "…" }  → neon frame around
 *    the profile banner (profile popup + cohor member cards)
 *    { ring: "gold" }                                     → golden avatar ring
 */
import type { CSSProperties } from "react";
import type { EquippedCosmetic } from "@/lib/api";

const DEFAULT_GLOW = "#A78BFA";

/** The glow colour of an effect, or null when it has none. */
export function cosmeticGlow(fx: EquippedCosmetic | null | undefined): string | null {
  if (!fx) return null;
  const glow = fx.renderData?.glow;
  if (typeof glow === "string" && glow) return glow;
  // Items described by a ring colour keyword (e.g. { ring: "gold" }).
  if (fx.renderData?.ring === "gold") return "#e8c664";
  return DEFAULT_GLOW;
}

/** Inline style for a username carrying a name effect (neon glow). */
export function usernameEffectStyle(fx: EquippedCosmetic | null | undefined): CSSProperties {
  const glow = cosmeticGlow(fx);
  if (!glow) return {};
  return {
    color: glow,
    textShadow: `0 0 6px ${glow}66, 0 0 14px ${glow}99, 0 0 28px ${glow}55`,
  };
}

/**
 * Inline style for a surface (banner / card frame) carrying a profile
 * decoration. Pairs with the shared `.cos-deco-frame` CSS class, which reads
 * the `--deco-glow` variable set here.
 */
export function profileDecorationStyle(deco: EquippedCosmetic | null | undefined): CSSProperties {
  const glow = cosmeticGlow(deco);
  if (!glow) return {};
  return { "--deco-glow": glow } as CSSProperties;
}

/** Class list helper: appends `.cos-deco-frame` when a decoration is equipped. */
export function withDecorationClass(base: string, deco: EquippedCosmetic | null | undefined) {
  return deco ? `${base} cos-deco-frame` : base;
}
