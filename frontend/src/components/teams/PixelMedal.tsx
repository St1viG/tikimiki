/**
 * PixelMedal — the gold / silver / bronze pixel-art medals previously
 * duplicated (twice each) across TeamsClient and FindClient. The medal face
 * fill is driven from the shared `--medal-gold|silver|bronze` tokens
 * (globals.css) via `currentColor`, so a token change re-skins every medal.
 * The structural ribbon / rim / shadow / highlight pixels are derived per
 * medal and stay as literals (they are not part of the token system).
 *
 * Renders nothing for ranks outside 1–3.
 */

export interface PixelMedalProps {
  rank: 1 | 2 | 3 | number;
  className?: string;
}

interface MedalPalette {
  /** CSS var name carrying the medal face colour. */
  token: string;
  ribbon: string;
  rim: string;
  shadow: string;
  highlight: string;
}

const PALETTES: Record<1 | 2 | 3, MedalPalette> = {
  1: { token: "--medal-gold",   ribbon: "#E87082", rim: "#C4A400", shadow: "#8A7300", highlight: "#FFF9C4" },
  2: { token: "--medal-silver", ribbon: "#5FA8C4", rim: "#7A8A99", shadow: "#525B66", highlight: "#F2F5F8" },
  3: { token: "--medal-bronze", ribbon: "#5DCAA5", rim: "#73401A", shadow: "#4A2A10", highlight: "#E8A26B" },
};

export function PixelMedal({ rank, className = "px-medal" }: PixelMedalProps) {
  if (rank !== 1 && rank !== 2 && rank !== 3) return null;
  const p = PALETTES[rank];
  // The face fill comes from the token via currentColor.
  return (
    <svg
      className={className}
      viewBox="0 0 9 11"
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ color: `var(${p.token})` }}
    >
      <rect x="2" y="0" width="1" height="4" fill={p.ribbon} />
      <rect x="6" y="0" width="1" height="4" fill={p.ribbon} />
      <rect x="1" y="3" width="7" height="1" fill={p.rim} />
      <rect x="0" y="4" width="9" height="5" fill="currentColor" />
      <rect x="1" y="9" width="7" height="1" fill={p.rim} />
      <rect x="2" y="10" width="5" height="1" fill={p.shadow} />
      <rect x="1" y="5" width="1" height="1" fill={p.highlight} />
      <rect x="2" y="4" width="1" height="1" fill={p.highlight} />
      <rect x="7" y="7" width="1" height="2" fill={p.rim} />
    </svg>
  );
}

export default PixelMedal;
