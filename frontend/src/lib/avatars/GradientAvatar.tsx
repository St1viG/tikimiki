/**
 * tikimiki generative avatar — "Aurora" gradient style.
 *
 * The calm, premium option in the avatar set. A deterministic aurora:
 * a dark base tile, a linear gradient at a hashed angle blending into the
 * dominant accent, plus 1–2 soft radial light blobs (in the lighter accent
 * shade) at hashed positions, finished with a subtle inner vignette for depth.
 * Every value derives from makeRng(seed), so the art is identical for a given
 * seed on server and client. No hard pattern — pure smooth Midnight Voltage glow.
 */

import {
  makeRng,
  accentFor,
  tileFor,
  type AvatarArtProps,
} from "@/lib/avatars/core";

/** Sanitize a seed into a collision-safe id fragment for SVG defs. */
function idHash(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function GradientAvatar({ seed, size = 64, className }: AvatarArtProps) {
  const rng = makeRng(seed);

  // Dominant accent + dark venue tile.
  const accent = accentFor(rng);
  const tile = tileFor(rng);

  // Unique <defs> namespace so many avatars can share one page.
  const ns = `av-aur-${idHash(seed)}`;
  const baseId = `${ns}-base`;
  const blobAId = `${ns}-blobA`;
  const blobBId = `${ns}-blobB`;
  const vignetteId = `${ns}-vig`;
  const blurId = `${ns}-blur`;

  // Base gradient at a hashed angle. Convert angle -> unit vector across the box.
  const angle = rng.range(0, Math.PI * 2);
  const cx = 40 + Math.cos(angle) * 40;
  const cy = 40 + Math.sin(angle) * 40;
  const x1 = 80 - cx;
  const y1 = 80 - cy;

  // The base sweep stays luminance-varied: deep tile -> accent.soft -> accent.core.
  // The core stop is held back from the far edge so it never blows out flat.
  const softStop = rng.range(0.42, 0.55);
  const coreStop = rng.range(0.82, 0.94);

  // Primary glow blob: always present, placed within the inscribed circle so it
  // reads when clipped to a circle. Polar placement keeps it off the corners.
  const aAng = rng.range(0, Math.PI * 2);
  const aRad = rng.range(8, 22);
  const ax = 40 + Math.cos(aAng) * aRad;
  const ay = 40 + Math.sin(aAng) * aRad;
  const aSize = rng.range(34, 46);
  const aOpacity = rng.range(0.55, 0.78);

  // Secondary, smaller glow ~60% of the time, offset from the primary for depth.
  const hasSecond = rng.bool(0.6);
  const bAng = aAng + rng.range(Math.PI * 0.5, Math.PI * 1.5);
  const bRad = rng.range(14, 26);
  const bx = 40 + Math.cos(bAng) * bRad;
  const by = 40 + Math.sin(bAng) * bRad;
  const bSize = rng.range(20, 30);
  const bOpacity = rng.range(0.3, 0.5);

  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        {/* Base sweep: dark venue into the dominant accent. */}
        <linearGradient
          id={baseId}
          x1={x1}
          y1={y1}
          x2={cx}
          y2={cy}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={tile} />
          <stop offset={softStop.toFixed(3)} stopColor={accent.soft} />
          <stop offset={coreStop.toFixed(3)} stopColor={accent.core} />
        </linearGradient>

        {/* Soft light blobs in the brighter accent shade — the "aurora". */}
        <radialGradient id={blobAId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent.light} stopOpacity={aOpacity} />
          <stop
            offset="0.55"
            stopColor={accent.core}
            stopOpacity={aOpacity * 0.45}
          />
          <stop offset="1" stopColor={accent.core} stopOpacity="0" />
        </radialGradient>

        <radialGradient id={blobBId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent.light} stopOpacity={bOpacity} />
          <stop offset="1" stopColor={accent.light} stopOpacity="0" />
        </radialGradient>

        {/* Inner vignette: transparent center, dark edges, for depth. */}
        <radialGradient id={vignetteId} cx="0.5" cy="0.5" r="0.62">
          <stop offset="0" stopColor="#000000" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#04030A" stopOpacity="0.72" />
        </radialGradient>

        <filter
          id={blurId}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>

      {/* Full-square dark base so it also reads as a rounded square. */}
      <rect x="0" y="0" width="80" height="80" fill={tile} />
      <rect x="0" y="0" width="80" height="80" fill={`url(#${baseId})`} />

      {/* Aurora glow blobs, softened. */}
      <g filter={`url(#${blurId})`}>
        <ellipse
          cx={ax}
          cy={ay}
          rx={aSize}
          ry={aSize * rng.range(0.78, 1)}
          fill={`url(#${blobAId})`}
        />
        {hasSecond && (
          <ellipse
            cx={bx}
            cy={by}
            rx={bSize}
            ry={bSize * rng.range(0.78, 1)}
            fill={`url(#${blobBId})`}
          />
        )}
      </g>

      {/* Subtle inner vignette for premium depth. */}
      <rect x="0" y="0" width="80" height="80" fill={`url(#${vignetteId})`} />
    </svg>
  );
}

export default GradientAvatar;
