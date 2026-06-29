import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { AV_POS } from "./AvatarStack";
import { formatXp } from "@/lib/format";
import { personName } from "@/lib/displayName";
import type { SoloPlayer } from "@/lib/api";

/**
 * SoloPlayerCard — a "free agent" card shared by /teams and /teams/find. The
 * avatar uses the shared {@link AV_POS} palette (indexed by the player's grid
 * position) so the same agent renders the same colour on both pages.
 *   - `cardClass` : "tm-solo" (/teams) vs "card tm-solo" (/teams/find surface).
 *   - `actionIcon`: prefix the invite button with a plus icon (/teams did).
 *   - `disabled`  : caller has no team to invite into (/teams/find disables).
 */
export interface SoloPlayerCardProps {
  player: SoloPlayer;
  /** Grid index — drives which AV_POS colour the avatar gets. */
  index: number;
  invited: boolean;
  sending: boolean;
  disabled?: boolean;
  onInvite: (player: SoloPlayer) => void;
  /** When set, the avatar + name open this player's profile popup. */
  onOpenProfile?: (username: string) => void;
  labels: {
    inviteToTeam: string;
    invited: string;
    inviting?: string;
  };
  cardClass?: string;
  actionIcon?: boolean;
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
}: SoloPlayerCardProps) {
  const name = personName(player);
  const openProfile = onOpenProfile
    ? () => onOpenProfile(player.username)
    : undefined;
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
        {player.skills[0] ?? `${formatXp(player.points)} XP`}
      </div>
      <button
        className="btn btn-ghost"
        disabled={disabled || sending || invited}
        onClick={() => onInvite(player)}
      >
        {actionIcon && <Icon name="plus" />}{" "}
        {sending
          ? labels.inviting ?? labels.inviteToTeam
          : invited
            ? labels.invited
            : labels.inviteToTeam}
      </button>
    </div>
  );
}

export default SoloPlayerCard;
