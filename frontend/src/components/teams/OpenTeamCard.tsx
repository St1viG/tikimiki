/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { Icon } from "@/components/Icon";
import { AvatarStack } from "./AvatarStack";
import type { OpenTeam } from "@/lib/api";

/**
 * OpenTeamCard — a single "open team" card, used on /teams for both the plain
 * "Open teams" grid and the "AI suggestions" ranked grid. Their small
 * differences are exposed as props:
 *   - `cardClass`   : base class, default "tm-open-card".
 *   - `showBadge`   : render the absolute "Open" badge.
 *   - `hackIcon`    : prefix the hackathon line with a hackathon icon.
 *   - `slotIcon`    : render a plus-icon in empty seats instead of a bare "+".
 *   - `score`       : how well the caller would complement this team — a
 *                     badge shown when the card renders a suggested
 *                     composition rather than the plain open-teams list.
 */
export interface OpenTeamCardProps {
  team: OpenTeam;
  requested: boolean;
  sending: boolean;
  onRequest: (team: OpenTeam) => void;
  labels: {
    openBadge?: string;
    lookingFor: string;
    members: string;
    requestJoin: string;
    requested: string;
    joining?: string;
  };
  cardClass?: string;
  showBadge?: boolean;
  hackIcon?: boolean;
  slotIcon?: boolean;
  score?: number;
}

export function OpenTeamCard({
  team,
  requested,
  sending,
  onRequest,
  labels,
  cardClass = "tm-open-card",
  showBadge = false,
  hackIcon = false,
  slotIcon = false,
  score,
}: OpenTeamCardProps) {
  const openSlots = Math.max(team.maxTeamSize - team.memberCount, 0);
  return (
    <div className={cardClass}>
      {showBadge && labels.openBadge && (
        <span className="badge badge-open tm-open-badge">{labels.openBadge}</span>
      )}
      <div className="tm-open-hack">
        {hackIcon && <Icon name="hackathon" />} {team.hackathonTitle}
      </div>
      <h3 className="tm-open-name">{team.name}</h3>
      <AvatarStack
        className="tm-open-avs"
        members={team.members}
        size="md"
        emptySlots={openSlots}
        slotContent={slotIcon ? <Icon name="plus" /> : "+"}
      />
      <div className="tm-open-need">
        {labels.lookingFor}{" "}
        <strong>
          {openSlots} {labels.members}
        </strong>
      </div>
      {score !== undefined && <span className="badge badge-open tm-open-score">+{score}</span>}
      <button
        className="btn btn-violet"
        disabled={sending || requested}
        onClick={() => onRequest(team)}
      >
        {sending
          ? (labels.joining ?? labels.requestJoin)
          : requested
            ? labels.requested
            : labels.requestJoin}
      </button>
    </div>
  );
}

export default OpenTeamCard;
