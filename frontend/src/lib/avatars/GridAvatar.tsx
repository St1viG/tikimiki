/**
 * GridAvatar — "Voltage Grid" (flat / modern).
 *
 * A GitHub-style identicon, simplified: a 5×5 grid of flat rounded pixels with
 * left-right mirror symmetry, in a single on-brand accent (two flat shades) on a
 * flat dark tile. No glow, no gradients — clean, modern, lots of negative space.
 *
 * Fully deterministic: identical art for an identical seed on server and client.
 * Pure presentational SVG — SSR-safe, no hooks, no client directive.
 */

import { makeRng, type AvatarArtProps } from "@/lib/avatars/core";

/** Tight, on-brand palette so every avatar belongs to the violet+lemon system. */
const ACCENTS = [
  { core: "#B49BFF", light: "#D6C6FF" }, // violet
  { core: "#ECE23A", light: "#F5FF45" }, // lemon
  { core: "#4FD8A6", light: "#86F0C8" }, // green
] as const;
const TILE = "#0E0B1F";

const VIEW = 80;
const COLS = 5;
const ROWS = 5;
// Generous inset → more negative space and fully inside the circular crop.
const PAD = 12;
const GRID = VIEW - PAD * 2; // 56
const CELL = GRID / COLS; // 11.2
const GAP = 2.2; // breathing room between pixels
const CELL_R = 3; // soft, modern rounded corners

export function GridAvatar({ seed, size = 64, className }: AvatarArtProps) {
  const rng = makeRng(seed);
  const accent = rng.pick(ACCENTS);

  // Slightly sparse for a clean look.
  const density = rng.range(0.42, 0.52);

  // Build the left half + center column, then mirror to the right
  // (col 0,1 → 4,3; col 2 is its own).
  type Cell = { col: number; row: number; light: boolean };
  const cells: Cell[] = [];
  for (let col = 0; col <= 2; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (!rng.bool(density)) continue;
      const light = rng.bool(0.22); // a few brighter pixels for gentle variety
      cells.push({ col, row, light });
      // Mirror the same light value so both halves appear symmetrically lit.
      if (col < 2) cells.push({ col: COLS - 1 - col, row, light });
    }
  }
  // A degenerate seed could produce no lit pixels; guarantee at least a center dot.
  if (cells.length === 0) cells.push({ col: 2, row: 2, light: true });

  const x = (col: number) => PAD + col * CELL + GAP / 2;
  const y = (row: number) => PAD + row * CELL + GAP / 2;
  const sz = CELL - GAP;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Flat dark tile (also reads correctly as a rounded square). */}
      <rect x="0" y="0" width={VIEW} height={VIEW} fill={TILE} />

      {/* Flat rounded pixels in one accent (two shades). */}
      <g>
        {cells.map((c, i) => (
          <rect
            key={i}
            x={x(c.col)}
            y={y(c.row)}
            width={sz}
            height={sz}
            rx={CELL_R}
            ry={CELL_R}
            fill={c.light ? accent.light : accent.core}
          />
        ))}
      </g>
    </svg>
  );
}

export default GridAvatar;
