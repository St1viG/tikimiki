import type { HackathonStatus, HackathonType } from "./index";

/** Shape returned by GET /api/v1/hackathons and /hackathons/:id. */
export interface HackathonSummary {
  hackathonId: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string;
  type: HackathonType;
  status: HackathonStatus;
  theme: string | null;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  maxParticipants: number | null;
  minTeamSize: number;
  maxTeamSize: number;
  location: string | null;
  /** Geographic coordinates (decimal degrees), or null when not set. */
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  /** Whether the organizing account has passed admin verification. */
  organizationVerified: boolean;
  participantCount: number;
  /** Non-deleted teams registered for the hackathon. */
  teamCount: number;
  /** Displayable prize string (e.g. top award), or null when none. */
  prizePool: string | null;
  createdAt: string;
}
