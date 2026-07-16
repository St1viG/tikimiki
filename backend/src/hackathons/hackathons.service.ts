import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { HackathonSummary } from "@tikimiki/types";
import { gatedAvatarUrl } from "../subscriptions/premium-personalization";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  applicationQuestions,
  channelGroups,
  channels,
  hackathonDrafts,
  hackathonPrizes,
  hackathons,
  organizations,
  permissions,
  serverRolePermissions,
  serverRoles,
  servers,
  teams,
  userRoles,
  users,
} from "../db/schema";
import { AuthzService } from "../common/authz.service";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  AddModeratorInput,
  CreateHackathonInput,
  CreatePrizeInput,
  HackathonDraftDto,
  ModeratorDto,
  SaveDraftInput,
  TeamOverviewDto,
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
  // PostGIS stores coords as (longitude, latitude) — Y extracts lat, X extracts lng.
  latitude: sql<number | null>`ST_Y(${hackathons.coordinates}::geometry)`,
  longitude: sql<number | null>`ST_X(${hackathons.coordinates}::geometry)`,
  logoUrl: hackathons.logoUrl,
  bannerUrl: hackathons.bannerUrl,
  organizationVerified: sql<boolean>`(${organizations.verificationStatus} = 'approved')`,
  createdAt: hackathons.createdAt,
  participantCount: sql<number>`(
    select count(*)::int from applications a
    where a.hackathon_id = ${hackathons.hackathonId} and a.status = 'approved'
  )`,
  teamCount: sql<number>`(
    select count(*)::int from teams t
    where t.hackathon_id = ${hackathons.hackathonId} and t.deleted_at is null
  )`,
  // Prefer hackathon-owned prizes (bountyId IS NULL) over sponsor bounties; within
  // that, pick the highest-ranked (lowest rank number) to surface the top prize.
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
  "startsAt" | "endsAt" | "registrationDeadline" | "createdAt" | "participantCount" | "teamCount"
>;

function toSummary(r: HackathonRow): HackathonSummary {
  return {
    ...r,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    registrationDeadline: r.registrationDeadline.toISOString(),
    createdAt: r.createdAt.toISOString(),
    // Drizzle returns count(*) as a string in some drivers; coerce to number.
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
    private readonly notifications: NotificationsService,
  ) {}

  async list(): Promise<HackathonSummary[]> {
    const rows = await this.db
      .select(columns)
      .from(hackathons)
      .innerJoin(organizations, eq(hackathons.organizationId, organizations.userId))
      .where(isNull(hackathons.deletedAt))
      .orderBy(asc(hackathons.startsAt));
    return rows.map(toSummary);
  }

  async getById(id: string): Promise<HackathonSummary> {
    const [row] = await this.db
      .select(columns)
      .from(hackathons)
      .innerJoin(organizations, eq(hackathons.organizationId, organizations.userId))
      .where(and(eq(hackathons.hackathonId, id), isNull(hackathons.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Hackathon not found");
    return toSummary(row);
  }

  async create(userId: string, input: CreateHackathonInput): Promise<HackathonSummary> {
    const [org] = await this.db
      .select({
        userId: organizations.userId,
        verificationStatus: organizations.verificationStatus,
      })
      .from(organizations)
      .where(eq(organizations.userId, userId))
      .limit(1);
    if (!org) {
      throw new ForbiddenException("Only organization accounts can create hackathons");
    }
    // SSU2: an organization gets hackathon-creation privileges only once an
    // administrator has approved its verification request.
    if (org.verificationStatus !== "approved") {
      throw new ForbiddenException(
        "Organization must be verified by an administrator before creating hackathons",
      );
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const registrationDeadline = new Date(input.registrationDeadline);

    if (!(startsAt.getTime() < endsAt.getTime())) {
      throw new BadRequestException("startsAt must be before endsAt");
    }
    if (!(registrationDeadline.getTime() < startsAt.getTime())) {
      throw new BadRequestException("registrationDeadline must be before startsAt");
    }
    if (input.maxParticipants != null && input.maxParticipants <= 0) {
      throw new BadRequestException("maxParticipants must be greater than 0");
    }
    const minTeamSize = input.minTeamSize ?? 1;
    if (minTeamSize < 1) {
      throw new BadRequestException("minTeamSize must be at least 1");
    }
    if (input.maxTeamSize < minTeamSize) {
      throw new BadRequestException("maxTeamSize must be greater than or equal to minTeamSize");
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
      throw new BadRequestException("latitude and longitude must be provided together");
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
          groupId: groupGeneral.groupId,
          type: "general",
          name: "glasanje-publike",
          position: 3,
        },
        {
          groupId: groupGeneral.groupId,
          type: "general",
          name: "rezultati",
          position: 4,
        },
        {
          groupId: groupGeneral.groupId,
          type: "general",
          name: "bounties",
          position: 5,
        },
        {
          groupId: groupTeams.groupId,
          type: "kanban",
          name: "moj-tim-board",
          position: 0,
        },
      ]);

      // Application-form questions supplied at publish time (choice types keep
      // their options + allowOther; text types are normalised to none).
      if (input.questions && input.questions.length > 0) {
        await tx.insert(applicationQuestions).values(
          input.questions.map((q, i) => {
            const isChoice = q.type === "single_choice" || q.type === "multi_choice";
            return {
              hackathonId: created.hackathonId,
              prompt: q.prompt,
              type: q.type,
              options: isChoice ? (q.options ?? []) : null,
              required: q.required,
              allowOther: isChoice ? q.allowOther : false,
              position: i,
            };
          }),
        );
      }

      // Publishing from a saved draft consumes it (owner-scoped).
      if (input.draftId) {
        await tx
          .delete(hackathonDrafts)
          .where(
            and(
              eq(hackathonDrafts.draftId, input.draftId),
              eq(hackathonDrafts.organizationId, userId),
            ),
          );
      }

      return created.hackathonId;
    });

    return this.getById(hackathonId);
  }

  /* ── drafts (resumable "organize a hackathon" form) ───────── */

  /** Ensure the caller is a verified organization account. */
  private async assertOrganization(userId: string): Promise<void> {
    const [org] = await this.db
      .select({
        userId: organizations.userId,
        verificationStatus: organizations.verificationStatus,
      })
      .from(organizations)
      .where(eq(organizations.userId, userId))
      .limit(1);
    if (!org) {
      throw new ForbiddenException("Only organization accounts can organize hackathons");
    }
    // Drafts are part of the creation flow, so they get the same SSU2 gate.
    if (org.verificationStatus !== "approved") {
      throw new ForbiddenException(
        "Organization must be verified by an administrator before creating hackathons",
      );
    }
  }

  private toDraft(row: {
    draftId: string;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): HackathonDraftDto {
    return {
      draftId: row.draftId,
      payload: (row.payload as Record<string, unknown>) ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** GET /hackathons/drafts — the caller's drafts, newest edit first. */
  async listDrafts(userId: string): Promise<HackathonDraftDto[]> {
    await this.assertOrganization(userId);
    const rows = await this.db
      .select({
        draftId: hackathonDrafts.draftId,
        payload: hackathonDrafts.payload,
        createdAt: hackathonDrafts.createdAt,
        updatedAt: hackathonDrafts.updatedAt,
      })
      .from(hackathonDrafts)
      .where(eq(hackathonDrafts.organizationId, userId))
      .orderBy(desc(hackathonDrafts.updatedAt));
    return rows.map((r) => this.toDraft(r));
  }

  /** Fetch one draft the caller owns (404 otherwise). */
  async getDraft(userId: string, draftId: string): Promise<HackathonDraftDto> {
    await this.assertOrganization(userId);
    const [row] = await this.db
      .select({
        draftId: hackathonDrafts.draftId,
        payload: hackathonDrafts.payload,
        createdAt: hackathonDrafts.createdAt,
        updatedAt: hackathonDrafts.updatedAt,
      })
      .from(hackathonDrafts)
      .where(and(eq(hackathonDrafts.draftId, draftId), eq(hackathonDrafts.organizationId, userId)))
      .limit(1);
    if (!row) throw new NotFoundException("Draft not found");
    return this.toDraft(row);
  }

  /** POST /hackathons/drafts — create a new draft. */
  async createDraft(userId: string, input: SaveDraftInput): Promise<HackathonDraftDto> {
    await this.assertOrganization(userId);
    const [row] = await this.db
      .insert(hackathonDrafts)
      .values({ organizationId: userId, payload: input.payload })
      .returning({
        draftId: hackathonDrafts.draftId,
        payload: hackathonDrafts.payload,
        createdAt: hackathonDrafts.createdAt,
        updatedAt: hackathonDrafts.updatedAt,
      });
    return this.toDraft(row);
  }

  /** PATCH /hackathons/drafts/:id — autosave the in-progress form. */
  async updateDraft(
    userId: string,
    draftId: string,
    input: SaveDraftInput,
  ): Promise<HackathonDraftDto> {
    await this.assertOrganization(userId);
    const [row] = await this.db
      .update(hackathonDrafts)
      .set({ payload: input.payload, updatedAt: new Date() })
      .where(and(eq(hackathonDrafts.draftId, draftId), eq(hackathonDrafts.organizationId, userId)))
      .returning({
        draftId: hackathonDrafts.draftId,
        payload: hackathonDrafts.payload,
        createdAt: hackathonDrafts.createdAt,
        updatedAt: hackathonDrafts.updatedAt,
      });
    if (!row) throw new NotFoundException("Draft not found");
    return this.toDraft(row);
  }

  /** DELETE /hackathons/drafts/:id — discard a draft. */
  async deleteDraft(userId: string, draftId: string): Promise<{ success: true }> {
    await this.assertOrganization(userId);
    const deleted = await this.db
      .delete(hackathonDrafts)
      .where(and(eq(hackathonDrafts.draftId, draftId), eq(hackathonDrafts.organizationId, userId)))
      .returning({ draftId: hackathonDrafts.draftId });
    if (deleted.length === 0) throw new NotFoundException("Draft not found");
    return { success: true };
  }

  /** GET /hackathons/mine — hackathons the caller organizes. */
  async listMine(userId: string): Promise<HackathonSummary[]> {
    const rows = await this.db
      .select(columns)
      .from(hackathons)
      .innerJoin(organizations, eq(hackathons.organizationId, organizations.userId))
      .where(and(eq(hackathons.organizationId, userId), isNull(hackathons.deletedAt)))
      .orderBy(desc(hackathons.createdAt));
    return rows.map(toSummary);
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
      .where(and(eq(hackathons.hackathonId, hackathonId), isNull(hackathons.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException("Hackathon not found");

    if (existing.status !== "upcoming") {
      throw new BadRequestException("Hackathon can only be edited while status is 'upcoming'");
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
      throw new BadRequestException("registrationDeadline must be before startsAt");
    }
    if (maxTeamSize < minTeamSize) {
      throw new BadRequestException("maxTeamSize must be greater than or equal to minTeamSize");
    }

    // Coordinates must come as a pair.
    if (input.latitude !== undefined || input.longitude !== undefined) {
      const lat = input.latitude !== undefined ? input.latitude : null;
      const lng = input.longitude !== undefined ? input.longitude : null;
      if ((lat == null) !== (lng == null)) {
        throw new BadRequestException("latitude and longitude must be provided together");
      }
    }

    // Physical/hybrid still need location + coords.
    if (effectiveType !== "virtual" && input.location === null) {
      throw new BadRequestException("Physical and hybrid hackathons require a location");
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
    if (input.registrationDeadline !== undefined) patch.registrationDeadline = registrationDeadline;
    if (input.maxParticipants !== undefined) patch.maxParticipants = input.maxParticipants;
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
      .where(and(eq(hackathons.hackathonId, hackathonId), isNull(hackathons.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException("Hackathon not found");

    const from = existing.status;
    const to = input.status;

    // Finite state machine: finished and cancelled are terminal states.
    const allowed: Record<string, string[]> = {
      upcoming: ["ongoing", "cancelled"],
      ongoing: ["finished", "cancelled"],
      finished: [],
      cancelled: [],
    };

    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Cannot transition from '${from}' to '${to}'`);
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
      .where(and(eq(hackathons.hackathonId, hackathonId), isNull(hackathons.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException("Hackathon not found");

    const isAdmin = await this.authz.isAdmin(userId);
    if (!isAdmin && existing.status !== "cancelled") {
      throw new BadRequestException("Only cancelled hackathons can be deleted. Cancel it first.");
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
      .where(and(eq(hackathonPrizes.hackathonId, hackathonId), isNull(hackathonPrizes.bountyId)))
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

  async updatePrize(userId: string, prizeId: string, input: UpdatePrizeInput): Promise<PrizeDto> {
    const [existing] = await this.db
      .select({ hackathonId: hackathonPrizes.hackathonId })
      .from(hackathonPrizes)
      .where(and(eq(hackathonPrizes.prizeId, prizeId), isNull(hackathonPrizes.bountyId)))
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

  async deletePrize(userId: string, prizeId: string): Promise<{ success: true }> {
    const [existing] = await this.db
      .select({ hackathonId: hackathonPrizes.hackathonId })
      .from(hackathonPrizes)
      .where(and(eq(hackathonPrizes.prizeId, prizeId), isNull(hackathonPrizes.bountyId)))
      .limit(1);
    if (!existing) throw new NotFoundException("Prize not found");

    await this.authz.assertHackathonOwnerOrAdmin(existing.hackathonId, userId);

    await this.db.delete(hackathonPrizes).where(eq(hackathonPrizes.prizeId, prizeId));

    return { success: true };
  }

  /* ── Moderators ──────────────────────────────────────────── */

  async listModerators(hackathonId: string): Promise<ModeratorDto[]> {
    const [server] = await this.db
      .select({ serverId: servers.serverId })
      .from(servers)
      .where(eq(servers.hackathonId, hackathonId))
      .limit(1);
    if (!server) return [];

    const [role] = await this.db
      .select({ serverRoleId: serverRoles.serverRoleId })
      .from(serverRoles)
      .where(and(eq(serverRoles.serverId, server.serverId), eq(serverRoles.name, "Moderator")))
      .limit(1);
    if (!role) return [];

    const rows = await this.db
      .select({
        userId: users.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: gatedAvatarUrl(users.userId, users.avatarUrl),
        assignedAt: userRoles.assignedAt,
      })
      .from(userRoles)
      .innerJoin(users, eq(users.userId, userRoles.userId))
      .where(eq(userRoles.serverRoleId, role.serverRoleId));

    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      assignedAt: r.assignedAt.toISOString(),
    }));
  }

  async addModerator(
    hackathonId: string,
    callerId: string,
    input: AddModeratorInput,
  ): Promise<ModeratorDto[]> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, callerId);

    const [server] = await this.db
      .select({ serverId: servers.serverId })
      .from(servers)
      .where(eq(servers.hackathonId, hackathonId))
      .limit(1);
    if (!server) throw new NotFoundException("Hackathon server not found");

    const [targetUser] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.userId, input.userId))
      .limit(1);
    if (!targetUser) throw new NotFoundException("User not found");

    let [role] = await this.db
      .select({ serverRoleId: serverRoles.serverRoleId })
      .from(serverRoles)
      .where(and(eq(serverRoles.serverId, server.serverId), eq(serverRoles.name, "Moderator")))
      .limit(1);

    if (!role) {
      // Lazy-create the "Moderator" role the first time any moderator is added.
      [role] = await this.db
        .insert(serverRoles)
        .values({ serverId: server.serverId, name: "Moderator" })
        .returning({ serverRoleId: serverRoles.serverRoleId });

      const permRows = await this.db
        .select({ permissionId: permissions.permissionId })
        .from(permissions)
        .where(inArray(permissions.name, ["manage_channels", "manage_messages", "kick_members"]));

      if (permRows.length > 0) {
        await this.db
          .insert(serverRolePermissions)
          .values(
            permRows.map((p) => ({
              serverRoleId: role.serverRoleId,
              permissionId: p.permissionId,
            })),
          )
          .onConflictDoNothing();
      }
    }

    await this.db
      .insert(userRoles)
      .values({
        serverRoleId: role.serverRoleId,
        userId: input.userId,
        assignedBy: callerId,
      })
      .onConflictDoNothing();

    const [hk] = await this.db
      .select({ title: hackathons.title })
      .from(hackathons)
      .where(eq(hackathons.hackathonId, hackathonId))
      .limit(1);

    await this.notifications.create({
      userId: input.userId,
      type: "position_assigned",
      template: { key: "moderator_assigned", params: { hackathonTitle: hk?.title ?? "" } },
      entityType: "hackathon",
      entityId: hackathonId,
    });

    return this.listModerators(hackathonId);
  }

  async removeModerator(
    hackathonId: string,
    callerId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, callerId);

    const [server] = await this.db
      .select({ serverId: servers.serverId })
      .from(servers)
      .where(eq(servers.hackathonId, hackathonId))
      .limit(1);
    if (!server) throw new NotFoundException("Hackathon server not found");

    const [role] = await this.db
      .select({ serverRoleId: serverRoles.serverRoleId })
      .from(serverRoles)
      .where(and(eq(serverRoles.serverId, server.serverId), eq(serverRoles.name, "Moderator")))
      .limit(1);
    if (!role) throw new NotFoundException("No moderators assigned yet");

    const deleted = await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.serverRoleId, role.serverRoleId), eq(userRoles.userId, targetUserId)))
      .returning({ userId: userRoles.userId });

    if (deleted.length === 0) throw new NotFoundException("User is not a moderator");

    return { success: true };
  }

  /* ── Calendar export ─────────────────────────────────────── */

  async getCalendar(hackathonId: string): Promise<string> {
    const [row] = await this.db
      .select({
        hackathonId: hackathons.hackathonId,
        title: hackathons.title,
        description: hackathons.description,
        startsAt: hackathons.startsAt,
        endsAt: hackathons.endsAt,
        location: hackathons.location,
      })
      .from(hackathons)
      .where(and(eq(hackathons.hackathonId, hackathonId), isNull(hackathons.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Hackathon not found");

    const fmt = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");

    // RFC 5545 §3.1: iCalendar lines must be folded at 75 octets, continuation
    // lines begin with a single SP.
    const fold = (line: string): string => {
      const parts: string[] = [];
      while (line.length > 75) {
        parts.push(line.slice(0, 75));
        line = " " + line.slice(75);
      }
      parts.push(line);
      return parts.join("\r\n");
    };

    const esc = (s: string) =>
      s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//tikimiki//Hackathon Calendar//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${row.hackathonId}@tikimiki`,
      `DTSTART:${fmt(row.startsAt)}`,
      `DTEND:${fmt(row.endsAt)}`,
      `SUMMARY:${esc(row.title)}`,
      `DESCRIPTION:${esc(row.description)}`,
      ...(row.location ? [`LOCATION:${esc(row.location)}`] : []),
      "END:VEVENT",
      "END:VCALENDAR",
    ];

    return lines.map(fold).join("\r\n") + "\r\n";
  }

  /* ── Teams overview ──────────────────────────────────────── */

  async teamsOverview(hackathonId: string, userId: string): Promise<TeamOverviewDto[]> {
    await this.authz.assertHackathonOwnerOrAdmin(hackathonId, userId);

    const rows = await this.db
      .select({
        teamId: teams.teamId,
        name: teams.name,
        memberCount: sql<number>`(
          select count(*)::int from team_members tm
          where tm.team_id = ${teams.teamId}
            and tm.deleted_at is null
            and tm.left_at is null
        )`,
        projectStatus: sql<string | null>`(
          select p.status from projects p
          where p.team_id = ${teams.teamId}
            and p.deleted_at is null
          limit 1
        )`,
      })
      .from(teams)
      .where(and(eq(teams.hackathonId, hackathonId), isNull(teams.deletedAt)))
      .orderBy(asc(teams.name));

    return rows.map((r) => ({
      teamId: r.teamId,
      name: r.name,
      memberCount: Number(r.memberCount),
      projectStatus: r.projectStatus ?? null,
    }));
  }
}
