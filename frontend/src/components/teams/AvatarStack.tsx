import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";
import { personName } from "@/lib/displayName";
import "./teams-shared.css";

/* Canonical avatar-position palette for team rosters, defined once and re-exported
   so every /teams grid cycles the palette identically. */
export const AV_POS = ["tm-av-v", "tm-av-l", "tm-av-t", "tm-av-r"] as const;

export type AvatarSize = "sm" | "md" | "xl";

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "tm-av-sm",
  md: "tm-av-md",
  xl: "tm-av-xl",
};

export interface StackMember {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface AvatarStackProps {
  /** Roster to render, in display order. */
  members: readonly StackMember[];
  /** Avatar pixel size class. */
  size: AvatarSize;
  /** Highlight this member with the "me" ring (matches against userId). */
  meId?: string | null;
  /** Number of empty "+" slots to append (open-team open seats). */
  emptySlots?: number;
  /** Content rendered inside each empty slot (e.g. a "+" or <Icon name="plus"/>). */
  slotContent?: React.ReactNode;
  /** When set, member avatars become clickable and open this user's profile. */
  onOpenProfile?: (username: string) => void;
  className?: string;
}

/**
 * AvatarStack — the repeated `tm-av … is-orb` + <GenerativeAvatar> roster.
 * Cycles {@link AV_POS} for per-member colour and applies the shared sizing
 * classes. The wrapping flex container (overlap/gap) is supplied by the caller
 * via `className` (e.g. `tm-tc-avs`, `tm-open-avs`, `tm-lb-avs`, `tm-sug-avs`).
 */
export function AvatarStack({
  members,
  size,
  meId,
  emptySlots = 0,
  slotContent = "+",
  onOpenProfile,
  className,
}: AvatarStackProps) {
  const sizeClass = SIZE_CLASS[size];
  const interactive = !!onOpenProfile;
  return (
    // When avatars are clickable they must stay in the a11y tree; decorative
    // stacks remain aria-hidden as before.
    <div className={className} aria-hidden={interactive ? undefined : "true"}>
      {members.map((m, i) => {
        const cls = `tm-av ${AV_POS[i % AV_POS.length]} ${sizeClass}${
          meId && m.userId === meId ? " tm-av-me" : ""
        } is-orb`;
        const avatar = m.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.avatarUrl} alt={m.username} className="orb-art" />
        ) : (
          <GenerativeAvatar seed={m.username} className="orb-art" />
        );
        if (!interactive) {
          return (
            <div key={m.userId} className={cls}>
              {avatar}
            </div>
          );
        }
        const label = personName(m);
        return (
          <div
            key={m.userId}
            className={cls}
            role="button"
            tabIndex={0}
            title={label}
            aria-label={label}
            style={{ cursor: "pointer" }}
            onClick={() => onOpenProfile!(m.username)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenProfile!(m.username);
              }
            }}
          >
            {avatar}
          </div>
        );
      })}
      {Array.from({ length: Math.max(emptySlots, 0) }).map((_, i) => (
        <div key={`slot-${i}`} className={`tm-av tm-av-slot ${sizeClass}`} aria-hidden="true">
          {slotContent}
        </div>
      ))}
    </div>
  );
}

export default AvatarStack;
