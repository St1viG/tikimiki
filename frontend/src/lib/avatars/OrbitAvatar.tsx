/**
 * OrbitAvatar — "Constellation" (flat, multi-hue).
 *
 * A tiny star-map / team graph: an accent hub, satellite nodes joined into a
 * constellation, and a faint elliptical orbit ring. Everything is FLAT — solid
 * fills, thin strokes, no blur/glow, no gradients, no shine.
 *
 * Each profile gets its OWN color identity: one of several distinct, well-spread
 * hues (violet, indigo, cyan, teal, green, lime, amber, coral, magenta), picked
 * deterministically from the seed. Each theme is monochromatic — a dark elevated
 * "floor" that pops off the violet page, mid-tone structure, and a bright hub —
 * so avatars look clearly different from each other and never blend into the UI.
 *
 * Fully deterministic (identical art for an identical seed, server and client)
 * and a pure function of props.
 */

import { makeRng, type AvatarArtProps } from "@/lib/avatars/core";

interface Theme {
  /** dark elevated floor — distinct hue, sits above the page surfaces */
  floor: string;
  /** mid tone — satellites, links, ring, dust */
  mid: string;
  /** bright tone — the hub (the one focal point) */
  bright: string;
}

/** A spread of distinct identities. Each is monochromatic for a clear, unique
 *  per-profile color while staying a cohesive set. */
const THEMES: readonly Theme[] = [
  { floor: "#2A1B57", mid: "#B49BFF", bright: "#D9CCFF" }, // violet
  { floor: "#1C2A66", mid: "#8AACFF", bright: "#B8CDFF" }, // indigo
  { floor: "#0A3E4A", mid: "#5CD2EA", bright: "#9FEAF8" }, // cyan
  { floor: "#0C4543", mid: "#4FD8B6", bright: "#8CF0D8" }, // teal
  { floor: "#16492A", mid: "#5FE08C", bright: "#9BF2B7" }, // green
  { floor: "#37420E", mid: "#C8E24F", bright: "#E9F782" }, // lime
  { floor: "#4A3110", mid: "#F7B23B", bright: "#FFD382" }, // amber
  { floor: "#4E1D26", mid: "#FB8080", bright: "#FFB1A8" }, // coral
  { floor: "#421A49", mid: "#ED8CDC", bright: "#FFB6EA" }, // magenta
];

const C = 40; // center of the 80×80 box

export function OrbitAvatar({ seed, size = 64, className }: AvatarArtProps) {
  const rng = makeRng(`orbit:${seed}`);
  const theme = rng.pick(THEMES);

  // Satellites: even sectors + jitter so they never bunch up
  const count = rng.int(4, 6);
  const base = rng.range(0, Math.PI * 2);
  const sector = (Math.PI * 2) / count;
  const sparkIndex = rng.int(0, count - 1); // one satellite shares the bright hub tone
  const stars = Array.from({ length: count }, (_, i) => {
    const angle = base + i * sector + rng.range(-sector * 0.24, sector * 0.24);
    const radius = rng.range(19, 28); // inside the inscribed circle
    return {
      x: C + Math.cos(angle) * radius,
      y: C + Math.sin(angle) * radius,
      r: rng.range(2.5, 3.6),
      spark: i === sparkIndex,
    };
  });

  // Faint background dust (flat, no shimmer)
  const dust = Array.from({ length: rng.int(4, 6) }, () => {
    const a = rng.range(0, Math.PI * 2);
    const rad = rng.range(9, 32);
    return { x: C + Math.cos(a) * rad, y: C + Math.sin(a) * rad, r: rng.range(0.5, 1) };
  });

  // The orbit ring — the soul of the piece
  const ringRx = rng.range(26, 30);
  const ringRy = rng.range(16, 21);
  const ringRot = rng.range(0, 180);
  const hubR = rng.range(5, 6);

  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
    >
      {/* Elevated colored floor (also reads correctly as a rounded square). */}
      <rect x="0" y="0" width="80" height="80" fill={theme.floor} />

      {/* Faint flat dust stars. */}
      <g fill={theme.mid} opacity="0.32">
        {dust.map((d, i) => (
          <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} />
        ))}
      </g>

      {/* Elliptical orbit ring. */}
      <ellipse
        cx={C}
        cy={C}
        rx={ringRx}
        ry={ringRy}
        fill="none"
        stroke={theme.mid}
        strokeWidth="1.25"
        opacity="0.5"
        transform={`rotate(${ringRot} ${C} ${C})`}
      />

      {/* Constellation links: faint rim polygon + thin hub spokes. */}
      <g stroke={theme.mid} strokeLinecap="round" fill="none">
        {stars.map((s, i) => {
          const n = stars[(i + 1) % stars.length];
          return (
            <line
              key={`rim${i}`}
              x1={s.x}
              y1={s.y}
              x2={n.x}
              y2={n.y}
              strokeWidth="0.95"
              opacity="0.24"
            />
          );
        })}
        {stars.map((s, i) => (
          <line
            key={`spoke${i}`}
            x1={C}
            y1={C}
            x2={s.x}
            y2={s.y}
            strokeWidth="1.15"
            opacity="0.52"
          />
        ))}
      </g>

      {/* Flat satellite nodes (one shares the bright hub tone). */}
      <g>
        {stars.map((s, i) => (
          <circle
            key={`s${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.spark ? theme.bright : theme.mid}
          />
        ))}
      </g>

      {/* Hub: a thin flat ring + a flat bright core (no glow, no shine). */}
      <circle
        cx={C}
        cy={C}
        r={hubR + 2.2}
        fill="none"
        stroke={theme.bright}
        strokeWidth="1.15"
        opacity="0.5"
      />
      <circle cx={C} cy={C} r={hubR} fill={theme.bright} />
    </svg>
  );
}

export default OrbitAvatar;
