/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { AV_POS } from "./AvatarStack";
import { formatXp } from "@/lib/format";
import { personName } from "@/lib/displayName";

/** The subset of SoloPlayer/TeammateSuggestion this card actually renders. */
export interface SoloPlayerCardPlayer {
  userId: string;
  username: string;
  displayName?: string | null;
  skills: string[];
  points?: number;
}

/**
 * SoloPlayerCard — a "free agent" card used on /teams (both the plain "Free
 * agents" list and the "AI suggestions" ranked list). The avatar uses the
 * shared {@link AV_POS} palette (indexed by the player's grid position).
 *   - `cardClass` : row surface class, default "tm-solo".
 *   - `actionIcon`: prefix the invite button with a plus icon.
 *   - `disabled`  : caller has no team to invite into.
 *   - `score`     : how well this player complements the caller's team — a
 *                   badge shown when the card renders a matching suggestion
 *                   rather than the plain free-agent list.
 */
export interface SoloPlayerCardProps {
  player: SoloPlayerCardPlayer;
  /** Grid index — drives which AV_POS colour the avatar gets. */
  index: number;
  invited: boolean;
  sending: boolean;
  disabled?: boolean;
  onInvite: (player: SoloPlayerCardPlayer) => void;
  /** When set, the avatar + name open this player's profile popup. */
  onOpenProfile?: (username: string) => void;
  labels: {
    inviteToTeam: string;
    invited: string;
    inviting?: string;
  };
  cardClass?: string;
  actionIcon?: boolean;
  score?: number;
}

export function SoloPlayerCard({
  player,
  index,
  invited,
  sending,
  disabled = false,
  onInvite,
  onOpenProfile,
  labels,
  cardClass = "tm-solo",
  actionIcon = false,
  score,
}: SoloPlayerCardProps) {
  const name = personName(player);
  const openProfile = onOpenProfile ? () => onOpenProfile(player.username) : undefined;
  const identityInteractive = openProfile
    ? {
        role: "button" as const,
        tabIndex: 0,
        style: { cursor: "pointer" },
        onClick: openProfile,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openProfile();
          }
        },
      }
    : {};
  return (
    <div className={cardClass}>
      <div
        className={`tm-av ${AV_POS[index % AV_POS.length]} tm-av-xl is-orb`}
        aria-hidden={openProfile ? undefined : "true"}
        aria-label={openProfile ? name : undefined}
        title={openProfile ? name : undefined}
        {...identityInteractive}
      >
        <GenerativeAvatar seed={player.username} className="orb-art" />
      </div>
      <div className="tm-solo-name" {...identityInteractive}>
        {name}
      </div>
      <div className="tm-handle">@{player.username}</div>
      <div className="tm-solo-role">
        {player.skills[0] ?? (player.points !== undefined ? `${formatXp(player.points)} XP` : "")}
      </div>
      {score !== undefined && <span className="badge badge-open tm-solo-score">+{score}</span>}
      <button
        className={`btn ${invited ? "btn-success" : "btn-ghost"}`}
        disabled={disabled || sending || invited}
        onClick={() => onInvite(player)}
      >
        {invited ? <Icon name="check" /> : actionIcon && <Icon name="plus" />}{" "}
        {sending
          ? (labels.inviting ?? labels.inviteToTeam)
          : invited
            ? labels.invited
            : labels.inviteToTeam}
      </button>
    </div>
  );
}

export default SoloPlayerCard;
