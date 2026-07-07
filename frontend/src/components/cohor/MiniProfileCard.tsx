import { Icon } from "@/components/Icon";
import { OrbArt } from "@/components/ui/OrbArt";
import { PremiumBadge } from "@/components/ui/PremiumBadge";
import { personName } from "@/lib/displayName";

/**
 * The identity portion of a mini profile card: banner, overlapping avatar,
 * name (+ Premium marker), handle and — when `showDetails` is set — the
 * member's roles and team.
 *
 * This is the single source of truth for the two cohor surfaces that show a
 * person's card: the floating popout when a server member is clicked, and the
 * docked profile panel shown on the right in a 1-1 DM. Each call site supplies
 * its own positioned wrapper; the inner look is identical because it is this
 * one component.
 */
export interface MiniProfileCardMember {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  isPremium?: boolean;
  /** Server roles — only rendered when `showDetails` is set. */
  roles?: string[];
  /** Team name — only rendered when `showDetails` is set. */
  teamName?: string | null;
}

export function MiniProfileCard({
  member,
  onOpenProfile,
  showDetails = false,
  viewProfileLabel,
  rolesLabel,
  teamLabel,
  noTeamLabel,
}: {
  member: MiniProfileCardMember;
  onOpenProfile: (username: string) => void;
  showDetails?: boolean;
  viewProfileLabel: string;
  rolesLabel?: string;
  teamLabel?: string;
  noTeamLabel?: string;
}) {
  const open = () => onOpenProfile(member.username);
  const name = personName({
    displayName: member.displayName,
    username: member.username,
  });

  return (
    <>
      <div
        className="mini-profile-banner"
        aria-hidden="true"
        style={
          member.bannerUrl
            ? {
                backgroundImage: `url(${member.bannerUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />
      <div className="mini-profile-body">
        <div className="mini-profile-head">
          <div
            className="mini-profile-av is-orb"
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
            title={viewProfileLabel}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            }}
          >
            <OrbArt url={member.avatarUrl} seed={member.username} />
          </div>
          <button
            type="button"
            className="mini-profile-open"
            aria-label={viewProfileLabel}
            title={viewProfileLabel}
            onClick={open}
          >
            <Icon name="external" className="ic-sm" />
          </button>
        </div>

        <div
          className="mini-profile-name"
          role="button"
          tabIndex={0}
          style={{ cursor: "pointer" }}
          title={viewProfileLabel}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open();
            }
          }}
        >
          <span className="mini-profile-name-text">{name}</span>
          {member.isPremium && <PremiumBadge size={13} />}
        </div>
        <div className="mini-profile-handle">@{member.username}</div>

        {showDetails && (
          <>
            <div className="mini-profile-section-label">{rolesLabel}</div>
            <div className="mini-profile-roles">
              {member.roles && member.roles.length > 0 ? (
                member.roles.map((r) => (
                  <span className="mini-profile-chip" key={r}>
                    {r}
                  </span>
                ))
              ) : (
                <span className="mini-profile-muted">—</span>
              )}
            </div>
            <div className="mini-profile-section-label">{teamLabel}</div>
            <div className="mini-profile-team">
              {member.teamName ?? noTeamLabel}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default MiniProfileCard;
