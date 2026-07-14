/**
 * tikimiki generative avatar — "Gem" (hex) style.
 *
 * The tikimiki signature avatar: the hackathon gem icon turned into a unique,
 * deterministic identity. A single pointy-top hexagon is cut into mirrored
 * triangular facets, each filled with the seed's dominant accent at a varying
 * shade/opacity — like a cut gem catching the venue's one electric light.
 * Strict left-right symmetry, a dark faceted edge, a soft accent glow, and one
 * tiny lemon-bright spark on a facet.
 *
 * Pure function of props — deterministic across SSR/CSR. Everything derives from
 * makeRng(seed); no Math.random, no clock, no hooks.
 */

import {
  makeRng,
  accentFor,
  tileFor,
  type AvatarArtProps,
  type AvatarAccent,
} from "@/lib/avatars/core";

/* Stable, collision-safe id suffix from the seed (so multiple avatars on one
   page never share gradient/filter ids). xmur3-lite — deterministic. */
function hashId(seed: string): string {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h ^= h >>> 16;
  return (h >>> 0).toString(36);
}

const CX = 40;
const CY = 40;
const R = 34; // hex circumradius — sits inside the 40-unit inscribed circle

/** Pointy-top hex vertex (index 0 = top, clockwise). */
function hexPoint(i: number): [number, number] {
  const a = (-90 + i * 60) * (Math.PI / 180);
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
}

/** Linear blend between two #rrggbb colors. t=0 -> a, t=1 -> b. */
function mix(a: string, b: string, t: number): string {
  const pa = [
    parseInt(a.slice(1, 3), 16),
    parseInt(a.slice(3, 5), 16),
    parseInt(a.slice(5, 7), 16),
  ];
  const pb = [
    parseInt(b.slice(1, 3), 16),
    parseInt(b.slice(3, 5), 16),
    parseInt(b.slice(5, 7), 16),
  ];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** One facet's fill color from a 0..1 "lightness" value, anchored on accent. */
function facetFill(accent: AvatarAccent, l: number): string {
  // l<0.5 -> toward soft (deep), l>0.5 -> toward light (glint)
  return l < 0.5
    ? mix(accent.soft, accent.core, l * 2)
    : mix(accent.core, accent.light, (l - 0.5) * 2);
}

export function HexAvatar({ seed, size = 64, className }: AvatarArtProps) {
  const rng = makeRng(seed);
  const accent = accentFor(rng);
  const tile = tileFor(rng);
  const uid = `hex-${hashId(seed)}`;

  const verts = Array.from({ length: 6 }, (_, i) => hexPoint(i));
  const hexPath = verts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

  // Edge midpoints — used to split each wedge into an inner + outer facet,
  // giving the "cut gem" lattice rather than a flat pinwheel.
  const mids = verts.map((_, i) => {
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i + 1) % 6];
    return [(ax + bx) / 2, (ay + by) / 2] as [number, number];
  });
  // Randomising innerScale in a narrow band keeps the "cut gem" lattice recognisable while varying per seed.
  const innerScale = rng.range(0.5, 0.62);
  const innerVerts = verts.map(([x, y]) => [
    CX + (x - CX) * innerScale,
    CY + (y - CY) * innerScale,
  ]) as [number, number][];
  const innerPath = innerVerts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

  /* Mirror-symmetric facet lightness.
     Six wedges (0=top going clockwise). The hex is mirrored across the vertical
     axis: wedge pairs (0,5), (1,4), (2,3) share a lightness so the gem reads as
     one symmetric cut. We derive 3 base values + a couple of accents. */
  const baseL = [rng.range(0.18, 0.42), rng.range(0.4, 0.7), rng.range(0.3, 0.55)];
  // Indices 0..5 map to pairs (0,5), (1,4), (2,3) to enforce left-right symmetry.
  const wedgeL = [baseL[0], baseL[1], baseL[2], baseL[2], baseL[1], baseL[0]];
  // Outer ring a touch brighter than its wedge (light grazes the cut edges).
  const outerBoost = rng.range(0.14, 0.26);

  // The single bright "spark" facet: pick one of the symmetric top wedges so the
  // highlight sits up where light would hit. Mirror it for symmetry-of-intent.
  const sparkTop = rng.bool(0.5); // top spark vs upper-side spark
  const glowOpacity = rng.range(0.4, 0.62);

  // Lemon-ish spark color: bias the accent's light toward brand lemon.
  const sparkColor = mix(accent.light, "#F5FF45", 0.45);

  const facets: { points: string; fill: string; op: number }[] = [];

  for (let i = 0; i < 6; i++) {
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i + 1) % 6];
    const [iax, iay] = innerVerts[i];
    const [ibx, iby] = innerVerts[(i + 1) % 6];
    const [mx, my] = mids[i];

    const lWedge = wedgeL[i];
    const lOuterA = Math.min(1, lWedge + outerBoost);
    const lOuterB = Math.max(0, lWedge - outerBoost * 0.5);

    // Inner facet (center triangle of the wedge): center -> innerA -> innerB
    facets.push({
      points: `${CX},${CY} ${iax.toFixed(2)},${iay.toFixed(2)} ${ibx.toFixed(2)},${iby.toFixed(2)}`,
      fill: facetFill(accent, lWedge),
      op: 1,
    });
    // Outer-left facet: innerA -> outerA -> mid
    facets.push({
      points: `${iax.toFixed(2)},${iay.toFixed(2)} ${ax.toFixed(2)},${ay.toFixed(
        2,
      )} ${mx.toFixed(2)},${my.toFixed(2)}`,
      fill: facetFill(accent, lOuterA),
      op: 1,
    });
    // Outer-right facet: innerB -> outerB -> mid
    facets.push({
      points: `${ibx.toFixed(2)},${iby.toFixed(2)} ${bx.toFixed(2)},${by.toFixed(
        2,
      )} ${mx.toFixed(2)},${my.toFixed(2)}`,
      fill: facetFill(accent, lOuterB),
      op: 1,
    });
  }

  // Spark sits up where light would graze the cut. Either the top apex
  // (centered, symmetric) or the midpoint of the upper-left edge — both lie on
  // the vertical axis of intent so the gem still reads as one symmetric cut.
  const [spx, spy] = sparkTop
    ? verts[0]
    : [(verts[5][0] + verts[0][0]) / 2, (verts[5][1] + verts[0][1]) / 2];

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
        {/* Soft accent glow behind the gem */}
        <radialGradient id={`${uid}-glow`} cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor={accent.core} stopOpacity={glowOpacity} />
          <stop offset="55%" stopColor={accent.soft} stopOpacity={glowOpacity * 0.35} />
          <stop offset="100%" stopColor={accent.soft} stopOpacity="0" />
        </radialGradient>
        {/* Subtle top-down vertical sheen over the whole gem */}
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="38%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        {/* Spark blur */}
        <filter id={`${uid}-spark`} x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <clipPath id={`${uid}-clip`}>
          <polygon points={hexPath} />
        </clipPath>
      </defs>

      {/* Dark tile background — fills the full square (rounded-square safe) */}
      <rect x="0" y="0" width="80" height="80" fill={tile} />

      {/* Glow halo */}
      <rect x="0" y="0" width="80" height="80" fill={`url(#${uid}-glow)`} />

      {/* Faceted gem */}
      <g clipPath={`url(#${uid}-clip)`}>
        {facets.map((f, i) => (
          <polygon key={i} points={f.points} fill={f.fill} fillOpacity={f.op} />
        ))}
        {/* Inner-ring outline — defines the cut, kept >= 1.2 in 80-space */}
        <polygon
          points={innerPath}
          fill="none"
          stroke="#07060F"
          strokeOpacity="0.34"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* Wedge spokes from center to each vertex (gem edges) */}
        {verts.map(([x, y], i) => (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x.toFixed(2)}
            y2={y.toFixed(2)}
            stroke="#07060F"
            strokeOpacity="0.28"
            strokeWidth="1.2"
          />
        ))}
        {/* Whole-gem sheen */}
        <polygon points={hexPath} fill={`url(#${uid}-sheen)`} />
      </g>

      {/* Dark faceted hex edge */}
      <polygon
        points={hexPath}
        fill="none"
        stroke="#07060F"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* Thin accent rim just inside the edge — gem catches the light */}
      <polygon
        points={hexPath}
        fill="none"
        stroke={accent.light}
        strokeOpacity="0.5"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Tiny lemon-bright spark glint on a top facet */}
      <g filter={`url(#${uid}-spark)`}>
        <circle cx={spx.toFixed(2)} cy={(spy + 4).toFixed(2)} r="2.4" fill={sparkColor} />
      </g>
      <circle
        cx={spx.toFixed(2)}
        cy={(spy + 4).toFixed(2)}
        r="1.1"
        fill="#FFFFFF"
        fillOpacity="0.9"
      />
    </svg>
  );
}

export default HexAvatar;
