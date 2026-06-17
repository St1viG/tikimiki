import type { ComponentType } from "react";
import type { AvatarArtProps, AvatarVariant } from "@/lib/avatars/core";
import { GridAvatar } from "@/lib/avatars/GridAvatar";
import { HexAvatar } from "@/lib/avatars/HexAvatar";
import { GradientAvatar } from "@/lib/avatars/GradientAvatar";
import { CircuitAvatar } from "@/lib/avatars/CircuitAvatar";
import { OrbitAvatar } from "@/lib/avatars/OrbitAvatar";

/**
 * GenerativeAvatar — the single entry point for tikimiki's default avatars.
 *
 * Pick a style with `variant` and pass a stable `seed` (user id or @handle).
 * The same seed always renders the same art (deterministic across SSR/CSR),
 * so a profile's default avatar is unique yet reproducible everywhere.
 *
 * This is a plain presentational component — no hooks, no "use client". It
 * dispatches to the matching style component from src/lib/avatars/.
 *
 *   <GenerativeAvatar seed="andrej" variant="hex" size={44} />
 */

/** The platform-wide default avatar style. Change this one line to re-skin
 *  every default avatar across the app. */
export const DEFAULT_AVATAR_VARIANT: AvatarVariant = "orbit";

export interface GenerativeAvatarProps {
  /** Stable seed — user id or @handle. Same seed => same avatar. */
  seed: string;
  /** Which generative style to render. Defaults to the platform default. */
  variant?: AvatarVariant;
  /** Rendered pixel size (width = height). Defaults to 64. */
  size?: number;
  className?: string;
}

/** Registry of every avatar style: id, human label and its component. */
export interface AvatarVariantEntry {
  id: AvatarVariant;
  label: string;
  component: ComponentType<AvatarArtProps>;
}

export const AVATAR_VARIANTS: readonly AvatarVariantEntry[] = [
  { id: "grid", label: "Voltage Grid", component: GridAvatar },
  { id: "hex", label: "Gem", component: HexAvatar },
  { id: "gradient", label: "Aurora", component: GradientAvatar },
  { id: "circuit", label: "Voltage", component: CircuitAvatar },
  { id: "orbit", label: "Constellation", component: OrbitAvatar },
];

/** Fast variant -> component lookup, derived from the registry. */
const VARIANT_COMPONENTS: Record<AvatarVariant, ComponentType<AvatarArtProps>> =
  AVATAR_VARIANTS.reduce(
    (acc, entry) => {
      acc[entry.id] = entry.component;
      return acc;
    },
    {} as Record<AvatarVariant, ComponentType<AvatarArtProps>>,
  );

export function GenerativeAvatar({
  seed,
  variant = DEFAULT_AVATAR_VARIANT,
  size = 64,
  className,
}: GenerativeAvatarProps) {
  const StyleComponent = VARIANT_COMPONENTS[variant];
  return <StyleComponent seed={seed} size={size} className={className} />;
}

export default GenerativeAvatar;
