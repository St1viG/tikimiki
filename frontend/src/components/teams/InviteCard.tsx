import { Icon } from "@/components/Icon";
import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { personName } from "@/lib/displayName";
import type { TeamInvitation } from "@/lib/api";

/**
 * InviteCard — a single team-invitation card shared by /teams and /teams/find.
 *
 * NOTE: the previous "AI match %" widget (TeamsClient `aiMatchPct` /
 * FindClient `mockMatch`) has been REMOVED. It fabricated a 70–99% score with
 * no backing API field on the invitation, shown next to real invites — a
 * misleading signal. The card now leads with the real hackathon/team context.
 *
 *   - `meSeed`     : avatar seed for the "you" orb (username on /teams, the
 *                    invitation id on /teams/find — kept per page).
 *   - `forIcon`    : prefix the eyebrow line with a calendar icon (/teams/find).
 *   - `cardClass`  : "tm-sug" (/teams) vs "card tm-sug" (/teams/find surface).
 *   - `declineLabel`: pages use different decline copy.
 */
export interface InviteCardProps {
  invite: TeamInvitation;
  busy: boolean;
  meSeed: string;
  onAccept: (inv: TeamInvitation) => void;
  onDecline: (inv: TeamInvitation) => void;
  labels: {
    you: string;
    acceptInvite: string;
    decline: string;
    accepting?: string;
    declining?: string;
    /** Fallback "why" copy when the invitation carries no message. */
    fallbackWhy?: string;
  };
  forIcon?: boolean;
  cardClass?: string;
}

export function InviteCard({
  invite,
  busy,
  meSeed,
  onAccept,
  onDecline,
  labels,
  forIcon = false,
  cardClass = "tm-sug",
}: InviteCardProps) {
  // Inviter's primary label: display name when set, else their @username.
  const inviterName = invite.invitedByUsername
    ? personName({
        displayName: invite.invitedByDisplayName,
        username: invite.invitedByUsername,
      })
    : invite.teamName;
  return (
    <div className={cardClass}>
      <div className="tm-sug-body">
        <div className="tm-sug-for">
          {forIcon && <Icon name="calendar" />} {invite.hackathonTitle} ·{" "}
          {invite.teamName}
        </div>
        <div className="tm-sug-avs" aria-hidden="true">
          <div className="tm-av tm-av-v tm-av-md is-orb">
            <GenerativeAvatar seed={invite.teamName} className="orb-art" />
          </div>
          {invite.invitedByUsername && (
            <div className="tm-av tm-av-t tm-av-md is-orb">
              <GenerativeAvatar seed={invite.invitedByUsername} className="orb-art" />
            </div>
          )}
          <div className="tm-av tm-av-v tm-av-md tm-av-me is-orb">
            <GenerativeAvatar seed={meSeed} className="orb-art" />
          </div>
        </div>
        <div className="tm-sug-names">
          {inviterName} + {labels.you}
        </div>
        {invite.invitedByUsername && (
          <div className="tm-handle">@{invite.invitedByUsername}</div>
        )}
        <div className="tm-sug-why">
          {invite.message ?? labels.fallbackWhy ?? invite.hackathonTitle}
        </div>
        <div className="tm-sug-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onAccept(invite)}
          >
            <Icon name="check" />{" "}
            {busy ? labels.accepting ?? labels.acceptInvite : labels.acceptInvite}
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => onDecline(invite)}
          >
            {busy ? labels.declining ?? labels.decline : labels.decline}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InviteCard;
