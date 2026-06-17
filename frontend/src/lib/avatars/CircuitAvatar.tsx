/**
 * tikimiki generative avatars — "Voltage" circuit style.
 *
 * A few BOLD circuit traces (orthogonal + 45°) with chunky node dots on a hashed
 * grid, plus ONE lightning-bolt glyph, in the seed's dominant accent (biased to
 * electric lemon) with a soft glow, on a dark Midnight-Voltage tile. Composed via
 * 4-fold rotational symmetry so it reads as a crafted circuit board, not noise.
 *
 * Pure function of `seed` — deterministic on server & client (no hooks, no clock,
 * no Math.random). Everything derives from makeRng(seed). Safe under SSR.
 */
import {
  makeRng,
  tileFor,
  AVATAR_ACCENTS,
  type AvatarArtProps,
  type AvatarAccent,
} from "@/lib/avatars/core";

/** Stable, collision-free id suffix from the seed (for gradient/filter ids). */
function seedHash(seed: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(36);
}

const C = 40; // center of the 80x80 box

/** Rotate a point (x,y) around the center by k * 90 degrees. */
function rot(x: number, y: number, k: number): [number, number] {
  const dx = x - C;
  const dy = y - C;
  switch (((k % 4) + 4) % 4) {
    case 1:
      return [C - dy, C + dx];
    case 2:
      return [C - dx, C - dy];
    case 3:
      return [C + dy, C - dx];
    default:
      return [x, y];
  }
}

function pts(points: Array<[number, number]>): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export function CircuitAvatar({ seed, size = 64, className }: AvatarArtProps) {
  const rng = makeRng(seed);
  const id = seedHash(seed);

  // Bias the dominant accent toward electric lemon (the brand "voltage"),
  // but still allow the full cohesive palette for variety.
  const accent: AvatarAccent = rng.bool(0.6)
    ? AVATAR_ACCENTS[0] // lemon
    : rng.pick(AVATAR_ACCENTS);
  const tile = tileFor(rng);

  // One trace arm built on a hashed grid, then echoed by 4-fold rotation so the
  // whole tile is balanced. Keep it FEW + BOLD: one polyline + 1-2 stub branches.
  // Grid step 14u keeps traces chunky and well inside the inscribed circle.
  const variant = rng.int(0, 2);

  // Arm path templates (orthogonal + 45° legs), all comfortably inside r~33.
  const arms: Array<Array<[number, number]>> = [
    // L-elbow reaching out then up
    [
      [40, 40],
      [40, 26],
      [54, 26],
      [54, 14],
    ],
    // staircase with a 45° kink
    [
      [40, 40],
      [40, 28],
      [52, 16],
      [66, 16],
    ],
    // long reach with a notch
    [
      [40, 40],
      [52, 40],
      [52, 24],
      [64, 24],
      [64, 14],
    ],
  ];
  const baseArm = arms[variant];

  // Small branch stubs that hang off the arm (give it that PCB feel).
  const branchTemplates: Array<Array<[number, number]>> = [
    [
      [54, 26],
      [54, 38],
    ],
    [
      [52, 16],
      [40, 16],
    ],
    [
      [52, 24],
      [52, 12],
    ],
  ];
  const branch = branchTemplates[variant];

  // Endpoints / junctions that get node dots (with their rotations).
  const nodeBasePoints: Array<[number, number]> = [
    baseArm[baseArm.length - 1],
    baseArm[Math.max(1, Math.floor(baseArm.length / 2))],
    branch[branch.length - 1],
  ];

  const rotations = [0, 1, 2, 3];
  const traceW = 3.4; // chunky stroke in the 80-unit space
  const innerW = 1.5;

  // Build rotated geometry.
  const armPolys = rotations.map((k) => baseArm.map(([x, y]) => rot(x, y, k)));
  const branchPolys = rotations.map((k) => branch.map(([x, y]) => rot(x, y, k)));
  const nodes: Array<{ x: number; y: number; r: number }> = [];
  rotations.forEach((k) => {
    nodeBasePoints.forEach(([x, y], i) => {
      const [rx, ry] = rot(x, y, k);
      nodes.push({ x: rx, y: ry, r: i === 0 ? 3.1 : 2.3 });
    });
  });

  // Central lightning bolt — bold, single glyph, sized to the core.
  const bolt: Array<[number, number]> = [
    [44, 28],
    [33, 43],
    [40, 43],
    [36, 54],
    [49, 37],
    [41.5, 37],
  ];

  // Faint backdrop grid dots (hashed grid feel) — kept subtle so it stays crisp.
  const gridDots: Array<[number, number]> = [];
  for (let gx = 19; gx <= 61; gx += 14) {
    for (let gy = 19; gy <= 61; gy += 14) {
      const d = Math.hypot(gx - C, gy - C);
      if (d <= 33 && rng.bool(0.55)) gridDots.push([gx, gy]);
    }
  }

  const gid = `cav-grad-${id}`;
  const glowId = `cav-glow-${id}`;
  const clipId = `cav-clip-${id}`;

  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent.light} />
          <stop offset="55%" stopColor={accent.core} />
          <stop offset="100%" stopColor={accent.soft} />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="80" height="80" rx="18" />
        </clipPath>
      </defs>

      {/* Dark tile fills the full square (also valid as a rounded square). */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="80" height="80" fill={tile} />
        {/* subtle accent vignette toward the center */}
        <rect x="0" y="0" width="80" height="80" fill={accent.soft} opacity={0.07} />

        {/* faint hashed-grid node dots */}
        {gridDots.map(([x, y], i) => (
          <circle key={`g${i}`} cx={x} cy={y} r={0.9} fill={accent.core} opacity={0.22} />
        ))}

        {/* glowing circuit cluster */}
        <g filter={`url(#${glowId})`}>
          {/* traces — chunky strokes */}
          {armPolys.map((p, i) => (
            <polyline
              key={`a${i}`}
              points={pts(p)}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth={traceW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {branchPolys.map((p, i) => (
            <polyline
              key={`b${i}`}
              points={pts(p)}
              fill="none"
              stroke={accent.core}
              strokeWidth={traceW * 0.72}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
            />
          ))}

          {/* node dots with dark cores (solder-pad look) */}
          {nodes.map((n, i) => (
            <g key={`n${i}`}>
              <circle cx={n.x} cy={n.y} r={n.r} fill={accent.light} />
              <circle cx={n.x} cy={n.y} r={n.r - 1.1} fill={tile} opacity={0.85} />
            </g>
          ))}

          {/* central voltage bolt */}
          <polygon
            points={pts(bolt)}
            fill={`url(#${gid})`}
            stroke={accent.light}
            strokeWidth={innerW}
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

export default CircuitAvatar;
