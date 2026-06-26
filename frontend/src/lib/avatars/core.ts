/**
 * tikimiki generative avatars — shared core.
 *
 * Default avatars are NOT initials. Each user gets a unique, deterministic piece
 * of generative art seeded by a stable string (user id or @handle). Same seed
 * always renders the same avatar — across devices, sessions and SSR/CSR — because
 * everything derives from this seeded PRNG, never from Math.random or the clock.
 *
 * Every avatar style (grid, hex, gradient, circuit, orbit) imports from here so
 * seeding and brand colors stay identical and cohesive across the set.
 */

export interface AvatarArtProps {
  /** Stable seed — user id or @handle. Same seed => same avatar. */
  seed: string;
  /** Rendered pixel size (width = height). Defaults to 64. */
  size?: number;
  className?: string;
}

export type AvatarVariant = "grid" | "hex" | "gradient" | "circuit" | "orbit";

/* Deterministic PRNG: xmur3 (string -> seed) + sfc32 (seed -> stream) */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number;
  /** true with probability p (default 0.5) */
  bool(p?: number): boolean;
  /** pick one element from an array */
  pick<T>(arr: readonly T[]): T;
  /** float in [min, max) */
  range(min: number, max: number): number;
}

/** Build a deterministic RNG from any seed string. */
export function makeRng(seed: string): Rng {
  const s = xmur3(seed || "tikimiki");
  const r = sfc32(s(), s(), s(), s());
  return {
    next: r,
    int: (min, max) => min + Math.floor(r() * (max - min + 1)),
    bool: (p = 0.5) => r() < p,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    range: (min, max) => min + r() * (max - min),
  };
}

/* Brand palette for avatars
   One dominant accent per avatar keeps the set varied yet cohesive (like a
   GitHub identicon's single hue, but on the Midnight Voltage palette). Each
   accent carries a core / light / soft (deep) shade for depth and glow. */

export interface AvatarAccent {
  /** human label (for the gallery) */
  name: string;
  /** main fill */
  core: string;
  /** brighter highlight / glow */
  light: string;
  /** deeper shade for depth + low-opacity fills */
  soft: string;
}

export const AVATAR_ACCENTS: readonly AvatarAccent[] = [
  { name: "lemon", core: "#ECE23A", light: "#F5FF45", soft: "#9C9420" },
  { name: "violet", core: "#B49BFF", light: "#D6C6FF", soft: "#6E54B5" },
  { name: "green", core: "#4FD8A6", light: "#86F0C8", soft: "#2E9C77" },
  { name: "amber", core: "#F7B23B", light: "#FFD27A", soft: "#C77F1E" },
  { name: "cyan", core: "#7DF9FF", light: "#B8FCFF", soft: "#39A9B8" },
  { name: "magenta", core: "#FF7FD8", light: "#FFB3E8", soft: "#C74FA0" },
];

/** Dark, violet-tinted tile backgrounds (the "unlit venue"). */
export const AVATAR_TILES: readonly string[] = ["#0C0A1B", "#100D22", "#15102B"];

/** Convenience: deterministically choose the dominant accent for a seed. */
export function accentFor(rng: Rng): AvatarAccent {
  return rng.pick(AVATAR_ACCENTS);
}

/** Convenience: deterministically choose a dark tile for a seed. */
export function tileFor(rng: Rng): string {
  return rng.pick(AVATAR_TILES);
}
