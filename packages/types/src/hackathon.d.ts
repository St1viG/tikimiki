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
    logoUrl: string | null;
    bannerUrl: string | null;
    participantCount: number;
    createdAt: string;
}
