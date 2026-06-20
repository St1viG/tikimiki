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
  hackathonPrizes,
  hackathons,
  organizations,
  servers,
} from "../db/schema";
import { AuthzService } from "../common/authz.service";
import type {
  CreateHackathonInput,
  CreatePrizeInput,
  UpdateHackathonInput,
  UpdatePrizeInput,
  UpdateStatusInput,
} from "./dto";

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
  prizePool: sql<string | null>`(
    select p.award_value from hackathon_prizes p
    where p.hackathon_id = ${hackathons.hackathonId}
      and p.award_value is not null
    order by (p.bounty_id is null) desc, p.rank asc nulls last
    limit 1
  )`,
};

export interface PrizeDto {
  prizeId: string;
  hackathonId: string;
  title: string;
  description: string | null;
  rank: number | null;
  awardValue: string | null;
  sponsorName: string | null;
}

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
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly authz: AuthzService,
  ) {}

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

  async create(
    userId: string,
    input: CreateHackathonInput,
  ): Promise<HackathonSummary> {
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

    if (!(startsAt.getTime() < endsAt.getTime())) {
      throw new BadRequestException("startsAt must be before endsAt");
    }
    if (!(registrationDeadline.getTime() < startsAt.getTime())) {
      throw new BadRequestException(
        "registrationDeadline must be before startsAt",
      );
    }
    if (input.maxParticipants != null && input.maxParticipants <= 0) {
      throw new BadRequestException("maxParticipants must be greater than 0");
    }
    const minTeamSize = input.minTeamSize ?? 1;
    if (minTeamSize < 1) {
      throw new BadRequestException("minTeamSize must be at least 1");
    }
    if (input.maxTeamSize < minTeamSize) {
      throw new BadRequestException(
        "maxTeamSize must be greater than or equal to minTeamSize",
      );
    }
    const hasCoords = input.latitude != null && input.longitude != null;
    if (input.type !== "virtual") {
      if (!input.location || !hasCoords) {
        throw new BadRequestException(
          "Physical and hybrid hackathons require a location and coordinates (latitude + longitude)",
        );
      }
    }
    if ((input.latitude == null) !== (input.longitude == null)) {
      throw new BadRequestException(
        "latitude and longitude must be provided together",
      );
    }

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
        {
          groupId: groupGeneral.groupId,
          type: "project",
          name: "predaja-projekta",
          position: 2,
        },
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

  /** PATCH /hackathons/:id — izmena polja (samo dok je status 'upcoming'). */
  async update(
    userId: string,
    hackathonId: string,
    input: UpdateHackathonInput,
  ): Promise<HackathonSummary> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    const [existing] = await this.db
      .select({
        status: hackathons.status,
        startsAt: hackathons.startsAt,
        endsAt: hackathons.endsAt,
        registrationDeadline: hackathons.registrationDeadline,
        minTeamSize: hackathons.minTeamSize,
        maxTeamSize: hackathons.maxTeamSize,
        type: hackathons.type,
      })
      .from(hackathons)
      .where(
        and(eq(hackathons.hackathonId, hackathonId), isNull(hackathons.deletedAt)),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Hackathon not found");

    if (existing.status !== "upcoming") {
      throw new BadRequestException(
        "Hackathon can only be edited while status is 'upcoming'",
      );
    }

    // Resolve effective values for cross-field validation.
    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    const registrationDeadline = input.registrationDeadline
      ? new Date(input.registrationDeadline)
      : existing.registrationDeadline;
    const minTeamSize = input.minTeamSize ?? existing.minTeamSize;
    const maxTeamSize = input.maxTeamSize ?? existing.maxTeamSize;
    const effectiveType = input.type ?? existing.type;

    if (!(startsAt.getTime() < endsAt.getTime())) {
      throw new BadRequestException("startsAt must be before endsAt");
    }
    if (!(registrationDeadline.getTime() < startsAt.getTime())) {
      throw new BadRequestException(
        "registrationDeadline must be before startsAt",
      );
    }
    if (maxTeamSize < minTeamSize) {
      throw new BadRequestException(
        "maxTeamSize must be greater than or equal to minTeamSize",
      );
    }

    // Coordinates must come as a pair.
    if (
      input.latitude !== undefined ||
      input.longitude !== undefined
    ) {
      const lat = input.latitude !== undefined ? input.latitude : null;
      const lng = input.longitude !== undefined ? input.longitude : null;
      if ((lat == null) !== (lng == null)) {
        throw new BadRequestException(
          "latitude and longitude must be provided together",
        );
      }
    }

    // Physical/hybrid still need location + coords.
    if (effectiveType !== "virtual" && input.location === null) {
      throw new BadRequestException(
        "Physical and hybrid hackathons require a location",
      );
    }

    const patch: Partial<typeof hackathons.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.type !== undefined) patch.type = input.type;
    if (input.theme !== undefined) patch.theme = input.theme;
    if (input.startsAt !== undefined) patch.startsAt = startsAt;
    if (input.endsAt !== undefined) patch.endsAt = endsAt;
    if (input.registrationDeadline !== undefined)
      patch.registrationDeadline = registrationDeadline;
    if (input.maxParticipants !== undefined)
      patch.maxParticipants = input.maxParticipants;
    if (input.minTeamSize !== undefined) patch.minTeamSize = input.minTeamSize;
    if (input.maxTeamSize !== undefined) patch.maxTeamSize = input.maxTeamSize;
    if (input.location !== undefined) patch.location = input.location;
    if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
    if (input.bannerUrl !== undefined) patch.bannerUrl = input.bannerUrl;

    const coordUpdate =
      input.latitude !== undefined && input.longitude !== undefined
        ? {
            coordinates:
              input.latitude !== null && input.longitude !== null
                ? sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)`
                : null,
          }
        : {};

    await this.db
      .update(hackathons)
      .set({ ...patch, ...coordUpdate })
      .where(eq(hackathons.hackathonId, hackathonId));

    return this.getById(hackathonId);
  }

  /** PATCH /hackathons/:id/status — promena statusa. */
  async updateStatus(
    userId: string,
    hackathonId: string,
    input: UpdateStatusInput,
  ): Promise<HackathonSummary> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    const [existing] = await this.db
      .select({ status: hackathons.status })
      .from(hackathons)
      .where(
        and(eq(hackathons.hackathonId, hackathonId), isNull(hackathons.deletedAt)),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Hackathon not found");

    const from = existing.status;
    const to = input.status;

    const allowed: Record<string, string[]> = {
      upcoming: ["ongoing", "cancelled"],
      ongoing: ["finished", "cancelled"],
      finished: [],
      cancelled: [],
    };

    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(
        `Cannot transition from '${from}' to '${to}'`,
      );
    }

    await this.db
      .update(hackathons)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(hackathons.hackathonId, hackathonId));

    return this.getById(hackathonId);
  }

  /** DELETE /hackathons/:id — soft delete (org briše vlastiti cancelled, admin uvek). */
  async remove(userId: string, hackathonId: string): Promise<{ success: true }> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    const [existing] = await this.db
      .select({ status: hackathons.status, organizationId: hackathons.organizationId })
      .from(hackathons)
      .where(
        and(eq(hackathons.hackathonId, hackathonId), isNull(hackathons.deletedAt)),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Hackathon not found");

    const isAdmin = await this.authz.isAdmin(userId);
    if (!isAdmin && existing.status !== "cancelled") {
      throw new BadRequestException(
        "Only cancelled hackathons can be deleted. Cancel it first.",
      );
    }

    await this.db
      .update(hackathons)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(hackathons.hackathonId, hackathonId));

    return { success: true };
  }

  /* ── Prizes ──────────────────────────────────────────────── */

  async listPrizes(hackathonId: string): Promise<PrizeDto[]> {
    const rows = await this.db
      .select({
        prizeId: hackathonPrizes.prizeId,
        hackathonId: hackathonPrizes.hackathonId,
        title: hackathonPrizes.title,
        description: hackathonPrizes.description,
        rank: hackathonPrizes.rank,
        awardValue: hackathonPrizes.awardValue,
        sponsorName: hackathonPrizes.sponsorName,
      })
      .from(hackathonPrizes)
      .where(
        and(
          eq(hackathonPrizes.hackathonId, hackathonId),
          isNull(hackathonPrizes.bountyId),
        ),
      )
      .orderBy(asc(hackathonPrizes.rank));

    return rows.map((r) => ({
      prizeId: r.prizeId,
      hackathonId: r.hackathonId,
      title: r.title,
      description: r.description,
      rank: r.rank,
      awardValue: r.awardValue,
      sponsorName: r.sponsorName,
    }));
  }

  async createPrize(
    userId: string,
    hackathonId: string,
    input: CreatePrizeInput,
  ): Promise<PrizeDto> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    const [row] = await this.db
      .insert(hackathonPrizes)
      .values({
        hackathonId,
        bountyId: null,
        title: input.title,
        description: input.description ?? null,
        rank: input.rank ?? null,
        awardValue: input.awardValue ?? null,
        sponsorName: input.sponsorName ?? null,
      })
      .returning();

    return {
      prizeId: row.prizeId,
      hackathonId: row.hackathonId,
      title: row.title,
      description: row.description,
      rank: row.rank,
      awardValue: row.awardValue,
      sponsorName: row.sponsorName,
    };
  }

  async updatePrize(
    userId: string,
    prizeId: string,
    input: UpdatePrizeInput,
  ): Promise<PrizeDto> {
    const [existing] = await this.db
      .select({ hackathonId: hackathonPrizes.hackathonId })
      .from(hackathonPrizes)
      .where(
        and(
          eq(hackathonPrizes.prizeId, prizeId),
          isNull(hackathonPrizes.bountyId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Prize not found");

    await this.authz.assertHackathonOwnerOrAdmin(existing.hackathonId, userId);

    const patch: Partial<typeof hackathonPrizes.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.rank !== undefined) patch.rank = input.rank;
    if (input.awardValue !== undefined) patch.awardValue = input.awardValue;
    if (input.sponsorName !== undefined) patch.sponsorName = input.sponsorName;

    const [row] = await this.db
      .update(hackathonPrizes)
      .set(patch)
      .where(eq(hackathonPrizes.prizeId, prizeId))
      .returning();

    return {
      prizeId: row.prizeId,
      hackathonId: row.hackathonId,
      title: row.title,
      description: row.description,
      rank: row.rank,
      awardValue: row.awardValue,
      sponsorName: row.sponsorName,
    };
  }

  async deletePrize(
    userId: string,
    prizeId: string,
  ): Promise<{ success: true }> {
    const [existing] = await this.db
      .select({ hackathonId: hackathonPrizes.hackathonId })
      .from(hackathonPrizes)
      .where(
        and(
          eq(hackathonPrizes.prizeId, prizeId),
          isNull(hackathonPrizes.bountyId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundException("Prize not found");

    await this.authz.assertHackathonOwnerOrAdmin(existing.hackathonId, userId);

    await this.db
      .delete(hackathonPrizes)
      .where(eq(hackathonPrizes.prizeId, prizeId));

    return { success: true };
  }
}
