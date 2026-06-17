import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { HackathonSummary } from "@tikimiki/types";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  channelGroups,
  channels,
  hackathons,
  organizations,
  servers,
} from "../db/schema";
import type { CreateHackathonInput } from "./dto";

const columns = {
  hackathonId: hackathons.hackathonId,
  organizationId: hackathons.organizationId,
  organizationName: organizations.name,
  title: hackathons.title,
  description: hackathons.description,
  type: hackathons.type,
  status: hackathons.status,
  theme: hackathons.theme,
  startsAt: hackathons.startsAt,
  endsAt: hackathons.endsAt,
  registrationDeadline: hackathons.registrationDeadline,
  maxParticipants: hackathons.maxParticipants,
  minTeamSize: hackathons.minTeamSize,
  maxTeamSize: hackathons.maxTeamSize,
  location: hackathons.location,
  /* Geography point → plain lat/lng for map rendering. Null when no coords.
     ST_X = longitude, ST_Y = latitude (cast geography→geometry for ST_X/Y). */
  latitude: sql<number | null>`ST_Y(${hackathons.coordinates}::geometry)`,
  longitude: sql<number | null>`ST_X(${hackathons.coordinates}::geometry)`,
  logoUrl: hackathons.logoUrl,
  bannerUrl: hackathons.bannerUrl,
  createdAt: hackathons.createdAt,
  participantCount: sql<number>`(
    select count(*)::int from applications a
    where a.hackathon_id = ${hackathons.hackathonId} and a.status = 'approved'
  )`,
  teamCount: sql<number>`(
    select count(*)::int from teams t
    where t.hackathon_id = ${hackathons.hackathonId} and t.deleted_at is null
  )`,
  /* Top displayable award. Prefers main hackathon prizes (bounty_id is null)
     over sponsor-bounty awards, then the lowest rank; falls back to any prize
     that carries a non-empty award_value. Null when nothing is displayable. */
  prizePool: sql<string | null>`(
    select p.award_value from hackathon_prizes p
    where p.hackathon_id = ${hackathons.hackathonId}
      and p.award_value is not null
    order by (p.bounty_id is null) desc, p.rank asc nulls last
    limit 1
  )`,
};

type HackathonRow = {
  startsAt: Date;
  endsAt: Date;
  registrationDeadline: Date;
  createdAt: Date;
  participantCount: number;
  teamCount: number;
} & Omit<
  HackathonSummary,
  | "startsAt"
  | "endsAt"
  | "registrationDeadline"
  | "createdAt"
  | "participantCount"
  | "teamCount"
>;

function toSummary(r: HackathonRow): HackathonSummary {
  return {
    ...r,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    registrationDeadline: r.registrationDeadline.toISOString(),
    createdAt: r.createdAt.toISOString(),
    participantCount: Number(r.participantCount),
    teamCount: Number(r.teamCount),
    prizePool: r.prizePool ?? null,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
  };
}

@Injectable()
export class HackathonsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async list(): Promise<HackathonSummary[]> {
    const rows = await this.db
      .select(columns)
      .from(hackathons)
      .innerJoin(
        organizations,
        eq(hackathons.organizationId, organizations.userId),
      )
      .where(isNull(hackathons.deletedAt))
      .orderBy(asc(hackathons.startsAt));
    return rows.map(toSummary);
  }

  async getById(id: string): Promise<HackathonSummary> {
    const [row] = await this.db
      .select(columns)
      .from(hackathons)
      .innerJoin(
        organizations,
        eq(hackathons.organizationId, organizations.userId),
      )
      .where(and(eq(hackathons.hackathonId, id), isNull(hackathons.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Hackathon not found");
    return toSummary(row);
  }

  /**
   * Create a hackathon (organization accounts only) and bootstrap its cohor
   * server. Cross-field validation mirrors the DB CHECK constraints so we fail
   * with a clear 400 before touching the DB.
   */
  async create(
    userId: string,
    input: CreateHackathonInput,
  ): Promise<HackathonSummary> {
    // Caller must be an organization (a user with an `organizations` row).
    const [org] = await this.db
      .select({ userId: organizations.userId })
      .from(organizations)
      .where(eq(organizations.userId, userId))
      .limit(1);
    if (!org) {
      throw new ForbiddenException(
        "Only organization accounts can create hackathons",
      );
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const registrationDeadline = new Date(input.registrationDeadline);

    // chk_hackathons_dates
    if (!(startsAt.getTime() < endsAt.getTime())) {
      throw new BadRequestException("startsAt must be before endsAt");
    }
    // chk_hackathons_registration_deadline
    if (!(registrationDeadline.getTime() < startsAt.getTime())) {
      throw new BadRequestException(
        "registrationDeadline must be before startsAt",
      );
    }
    // chk_hackathons_max_participants (also enforced by zod .positive())
    if (input.maxParticipants != null && input.maxParticipants <= 0) {
      throw new BadRequestException("maxParticipants must be greater than 0");
    }
    // chk_hackathons_team_size
    const minTeamSize = input.minTeamSize ?? 1;
    if (minTeamSize < 1) {
      throw new BadRequestException("minTeamSize must be at least 1");
    }
    if (input.maxTeamSize < minTeamSize) {
      throw new BadRequestException(
        "maxTeamSize must be greater than or equal to minTeamSize",
      );
    }
    // chk_hackathons_physical_location — non-virtual requires location + coords
    const hasCoords =
      input.latitude != null && input.longitude != null;
    if (input.type !== "virtual") {
      if (!input.location || !hasCoords) {
        throw new BadRequestException(
          "Physical and hybrid hackathons require a location and coordinates (latitude + longitude)",
        );
      }
    }
    // Coordinates only make sense as a pair.
    if ((input.latitude == null) !== (input.longitude == null)) {
      throw new BadRequestException(
        "latitude and longitude must be provided together",
      );
    }

    // Same EWKT construction seed.ts uses: ST_SetSRID(ST_MakePoint(lng, lat), 4326).
    const coordinates = hasCoords
      ? sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)`
      : null;

    const hackathonId = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(hackathons)
        .values({
          organizationId: userId,
          title: input.title,
          description: input.description,
          type: input.type,
          status: "upcoming",
          theme: input.theme ?? null,
          startsAt,
          endsAt,
          registrationDeadline,
          maxParticipants: input.maxParticipants ?? null,
          minTeamSize,
          maxTeamSize: input.maxTeamSize,
          location: input.location ?? null,
          coordinates,
          logoUrl: input.logoUrl ?? null,
          bannerUrl: input.bannerUrl ?? null,
        })
        .returning({ hackathonId: hackathons.hackathonId });

      // Bootstrap the cohor server (one per hackathon) with the same default
      // group/channel layout seed.ts uses for the ETF server.
      const [server] = await tx
        .insert(servers)
        .values({ hackathonId: created.hackathonId, name: input.title })
        .returning({ serverId: servers.serverId });

      const [groupGeneral] = await tx
        .insert(channelGroups)
        .values({ serverId: server.serverId, name: "OPŠTE", position: 0 })
        .returning({ groupId: channelGroups.groupId });
      const [groupTeams] = await tx
        .insert(channelGroups)
        .values({ serverId: server.serverId, name: "TIMOVI", position: 1 })
        .returning({ groupId: channelGroups.groupId });

      await tx.insert(channels).values([
        {
          groupId: groupGeneral.groupId,
          type: "general",
          name: "opšte",
          position: 0,
        },
        {
          groupId: groupGeneral.groupId,
          type: "announcements",
          name: "najave",
          position: 1,
        },
        // Project hand-in surface (one per server). Renders the project
        // submission/showcase, not a message stream.
        {
          groupId: groupGeneral.groupId,
          type: "project",
          name: "predaja-projekta",
          position: 2,
        },
        // The team kanban board surface (each member sees their own team).
        {
          groupId: groupTeams.groupId,
          type: "kanban",
          name: "moj-tim-board",
          position: 0,
        },
      ]);

      return created.hackathonId;
    });

    return this.getById(hackathonId);
  }
}
