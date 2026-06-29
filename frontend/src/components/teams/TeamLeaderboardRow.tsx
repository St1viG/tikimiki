import { Icon } from "@/components/Icon";
import { AvatarStack } from "./AvatarStack";
import { PixelMedal } from "./PixelMedal";
import { formatXp } from "@/lib/format";
import type { LeaderboardEntry } from "@/lib/api";

/** Pixel-art spark SVG — the XP marker for /teams leaderboard rows. */
export function PxSpark() {
  return (
    <svg
      className="px-spark"
      viewBox="0 0 5 9"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="2" y="0" width="2" height="1" fill="currentColor" />
      <rect x="1" y="1" width="2" height="1" fill="currentColor" />
      <rect x="1" y="2" width="2" height="1" fill="currentColor" />
      <rect x="0" y="3" width="3" height="1" fill="currentColor" />
      <rect x="1" y="4" width="4" height="1" fill="currentColor" />
      <rect x="2" y="5" width="2" height="1" fill="currentColor" />
      <rect x="1" y="6" width="2" height="1" fill="currentColor" />
      <rect x="1" y="7" width="2" height="1" fill="currentColor" />
      <rect x="0" y="8" width="2" height="1" fill="currentColor" />
    </svg>
  );
}

/**
 * TeamLeaderboardRow — a ranked team row shared by /teams and /teams/find.
 * Top-3 ranks get a {@link PixelMedal} (token-driven). The XP marker and the
 * pixel-font treatment differ per page, exposed via props:
 *   - `cardClass` : "tm-lb-row" (/teams) vs "card tm-lb-row" (/teams/find).
 *   - `pixelFont` : wrap rank/XP numbers in `.px-font` (/teams only).
 *   - `xpMarker`  : "spark" (pixel spark, /teams) or "flame" (icon, /teams/find).
 *   - `youLabel`  : when set and `isYou`, render the "you" pill (/teams).
 */
export interface TeamLeaderboardRowProps {
  entry: LeaderboardEntry;
  isYou?: boolean;
  cardClass?: string;
  pixelFont?: boolean;
  xpMarker?: "spark" | "flame";
  youLabel?: string;
  /** When set, member avatars open this user's profile popup. */
  onOpenProfile?: (username: string) => void;
}

export function TeamLeaderboardRow({
  entry,
  isYou = false,
  cardClass = "tm-lb-row",
  pixelFont = false,
  xpMarker = "spark",
  youLabel,
  onOpenProfile,
}: TeamLeaderboardRowProps) {
  const rankClass =
    entry.rank === 1
      ? `${cardClass} tm-lb-gold`
      : entry.rank === 2
        ? `${cardClass} tm-lb-silver`
        : entry.rank === 3
          ? `${cardClass} tm-lb-bronze`
          : cardClass;
  const numClass = pixelFont ? "px-font" : undefined;
  return (
    <div className={rankClass}>
      <div className="tm-lb-rank">
        <PixelMedal rank={entry.rank} />
        <span className={numClass}>{entry.rank}</span>
      </div>
      <AvatarStack
        className="tm-lb-avs"
        members={entry.members}
        size="sm"
        onOpenProfile={onOpenProfile}
      />
      <div className="tm-lb-name">
        {entry.teamName}
        {isYou && youLabel && <span className="tm-r-you">{youLabel}</span>}
      </div>
      <div className="tm-lb-xp">
        {xpMarker === "spark" ? <PxSpark /> : <Icon name="flame" />}{" "}
        <span className={numClass}>{formatXp(entry.totalXp)}</span> XP
      </div>
    </div>
  );
}

export default TeamLeaderboardRow;
