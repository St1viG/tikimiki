import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NotificationTemplateRef } from "@tikimiki/types";
import { ApplicationsService } from "../applications/applications.service";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  applications,
  channelGroups,
  channels,
  hackathons,
  memberSkills,
  members,
  servers,
  skills,
  teamInvitations,
  teamJoinRequests,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";

type TeamNotifType =
  | "team_invitation_received"
  | "team_invitation_declined"
  | "team_request_received"
  | "team_request_accepted";
import type { CreateTeamInput, InviteInput, JoinRequestInput } from "./dto";

/* ── response shapes ──────────────────────────────────────── */

export interface TeamMemberDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "leader" | "member";
}

export interface TeamDto {
  teamId: string;
  name: string;
  hackathonId: string;
  hackathonTitle: string;
  status: string;
  /** The caller's own hackathon-application status: "pending" | "approved" | "rejected" | "none". */
  applicationStatus: string;
  /** The Cohor server for this team's hackathon — null if it has none yet. */
  serverId: string | null;
  memberCount: number;
  totalXp: number;
  members: TeamMemberDto[];
  createdAt: string;
}

export interface OpenTeamMemberDto {
  userId: string;
  username: string;
  displayName: string | null;
}

export interface OpenTeamDto {
  teamId: string;
  name: string;
  hackathonId: string;
  hackathonTitle: string;
  memberCount: number;
  maxTeamSize: number;
  members: OpenTeamMemberDto[];
}

export interface LeaderboardMemberDto {
  userId: string;
  username: string;
  displayName: string | null;
}

export interface LeaderboardEntryDto {
  rank: number;
  teamId: string;
  teamName: string;
  hackathonTitle: string;
  totalXp: number;
  members: LeaderboardMemberDto[];
}

export interface SoloPlayerDto {
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  points: number;
  skills: string[];
}

export interface JoinRequestDto {
  requestId: string;
  teamId: string;
  userId: string;
  username: string;
  displayName: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}

export interface InvitationDto {
  invitationId: string;
  teamId: string;
  teamName: string;
  hackathonTitle: string;
  invitedByUsername: string | null;
  invitedByDisplayName: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}

/* ── internal row helpers ─────────────────────────────────── */

interface ActiveMemberRow {
  teamId: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "leader" | "member";
  points: number;
}

@Injectable()
export class TeamsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifications: NotificationsService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  /** Loads active members (with points + username) for the given team ids. */
  private async loadActiveMembers(teamIds: string[]): Promise<Map<string, ActiveMemberRow[]>> {
    const map = new Map<string, ActiveMemberRow[]>();
    if (teamIds.length === 0) return map;

    const rows = await this.db
      .select({
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: teamMembers.role,
        points: members.points,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.userId))
      .innerJoin(members, eq(teamMembers.userId, members.userId))
      .where(and(inArray(teamMembers.teamId, teamIds), activeTeamMember))
      .orderBy(asc(teamMembers.joinedAt));

    for (const r of rows) {
      const list = map.get(r.teamId) ?? [];
      list.push(r);
      map.set(r.teamId, list);
    }
    return map;
  }

  /** Builds a full TeamDto for a single team id. */
  /** The caller's own (non-deleted) application status for a hackathon — "none" if they never applied. */
  private async myApplicationStatuses(
    userId: string,
    hackathonIds: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (hackathonIds.length === 0) return map;
    const rows = await this.db
      .select({ hackathonId: applications.hackathonId, status: applications.status })
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          inArray(applications.hackathonId, hackathonIds),
          isNull(applications.deletedAt),
        ),
      );
    for (const r of rows) map.set(r.hackathonId, r.status);
    return map;
  }

  private async buildTeamDto(teamId: string, callerId: string): Promise<TeamDto> {
    const [team] = await this.db
      .select({
        teamId: teams.teamId,
        name: teams.name,
        hackathonId: teams.hackathonId,
        hackathonTitle: hackathons.title,
        status: hackathons.status,
        serverId: servers.serverId,
        createdAt: teams.createdAt,
      })
      .from(teams)
      .innerJoin(hackathons, eq(teams.hackathonId, hackathons.hackathonId))
      .leftJoin(servers, eq(servers.hackathonId, teams.hackathonId))
      .where(and(eq(teams.teamId, teamId), isNull(teams.deletedAt)))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    const memberMap = await this.loadActiveMembers([teamId]);
    const active = memberMap.get(teamId) ?? [];
    const appStatuses = await this.myApplicationStatuses(callerId, [team.hackathonId]);

    return {
      teamId: team.teamId,
      name: team.name,
      hackathonId: team.hackathonId,
      hackathonTitle: team.hackathonTitle,
      status: team.status,
      applicationStatus: appStatuses.get(team.hackathonId) ?? "none",
      serverId: team.serverId,
      memberCount: active.length,
      totalXp: active.reduce((sum, m) => sum + Number(m.points), 0),
      members: active.map((m) => ({
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        role: m.role,
      })),
      createdAt: team.createdAt.toISOString(),
    };
  }

  /** GET /teams/me — teams where the caller is an active member. */
  async myTeams(userId: string): Promise<TeamDto[]> {
    const callerTeams = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), activeTeamMember));

    const teamIds = callerTeams.map((t) => t.teamId);
    if (teamIds.length === 0) return [];

    const teamRows = await this.db
      .select({
        teamId: teams.teamId,
        name: teams.name,
        hackathonId: teams.hackathonId,
        hackathonTitle: hackathons.title,
        status: hackathons.status,
        serverId: servers.serverId,
        createdAt: teams.createdAt,
      })
      .from(teams)
      .innerJoin(hackathons, eq(teams.hackathonId, hackathons.hackathonId))
      .leftJoin(servers, eq(servers.hackathonId, teams.hackathonId))
      .where(and(inArray(teams.teamId, teamIds), isNull(teams.deletedAt)))
      .orderBy(desc(teams.createdAt));

    const memberMap = await this.loadActiveMembers(teamRows.map((t) => t.teamId));
    const appStatuses = await this.myApplicationStatuses(
      userId,
      teamRows.map((t) => t.hackathonId),
    );

    return teamRows.map((t) => {
      const active = memberMap.get(t.teamId) ?? [];
      return {
        teamId: t.teamId,
        name: t.name,
        hackathonId: t.hackathonId,
        hackathonTitle: t.hackathonTitle,
        status: t.status,
        applicationStatus: appStatuses.get(t.hackathonId) ?? "none",
        serverId: t.serverId,
        memberCount: active.length,
        totalXp: active.reduce((sum, m) => sum + Number(m.points), 0),
        members: active.map((m) => ({
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
          avatarUrl: m.avatarUrl,
          role: m.role,
        })),
        createdAt: t.createdAt.toISOString(),
      };
    });
  }

  /** GET /teams/open — joinable teams the caller is NOT in. */
  async openTeams(userId: string): Promise<OpenTeamDto[]> {
    const memberCountSql = sql<number>`(
      select count(*)::int from team_members tm
      where tm.team_id = ${teams.teamId}
        and tm.left_at is null and tm.deleted_at is null
    )`;
    const callerMemberSql = sql<boolean>`exists (
      select 1 from team_members tm
      where tm.team_id = ${teams.teamId}
        and tm.user_id = ${userId}
        and tm.left_at is null and tm.deleted_at is null
    )`;

    const rows = await this.db
      .select({
        teamId: teams.teamId,
        name: teams.name,
        hackathonId: teams.hackathonId,
        hackathonTitle: hackathons.title,
        maxTeamSize: hackathons.maxTeamSize,
        memberCount: memberCountSql,
        callerIsMember: callerMemberSql,
      })
      .from(teams)
      .innerJoin(hackathons, eq(teams.hackathonId, hackathons.hackathonId))
      .where(isNull(teams.deletedAt))
      .orderBy(desc(teams.createdAt));

    // Filter in JS instead of SQL to reuse the two correlated subquery results
    // computed above without a second round-trip.
    const open = rows.filter(
      (r) => !r.callerIsMember && Number(r.memberCount) < Number(r.maxTeamSize),
    );

    const memberMap = await this.loadActiveMembers(open.map((r) => r.teamId));

    return open.map((r) => {
      const active = memberMap.get(r.teamId) ?? [];
      return {
        teamId: r.teamId,
        name: r.name,
        hackathonId: r.hackathonId,
        hackathonTitle: r.hackathonTitle,
        memberCount: Number(r.memberCount),
        maxTeamSize: Number(r.maxTeamSize),
        members: active.map((m) => ({
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
        })),
      };
    });
  }

  /** GET /teams/leaderboard (public) — top 20 teams by totalXp. */
  async leaderboard(): Promise<LeaderboardEntryDto[]> {
    const totalXpSql = sql<number>`coalesce((
      select sum(m.points)::int from team_members tm
      join members m on m.user_id = tm.user_id
      where tm.team_id = ${teams.teamId}
        and tm.left_at is null and tm.deleted_at is null
    ), 0)`;

    const rows = await this.db
      .select({
        teamId: teams.teamId,
        teamName: teams.name,
        hackathonTitle: hackathons.title,
        totalXp: totalXpSql,
      })
      .from(teams)
      .innerJoin(hackathons, eq(teams.hackathonId, hackathons.hackathonId))
      .where(isNull(teams.deletedAt))
      .orderBy(desc(totalXpSql))
      .limit(20);

    const memberMap = await this.loadActiveMembers(rows.map((r) => r.teamId));

    return rows.map((r, idx) => {
      const active = memberMap.get(r.teamId) ?? [];
      return {
        rank: idx + 1,
        teamId: r.teamId,
        teamName: r.teamName,
        hackathonTitle: r.hackathonTitle,
        totalXp: Number(r.totalXp),
        members: active.map((m) => ({
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
        })),
      };
    });
  }

  /** GET /teams/solo — members not in any active team. */
  async soloPlayers(): Promise<SoloPlayerDto[]> {
    const inActiveTeamSql = sql<boolean>`exists (
      select 1 from team_members tm
      where tm.user_id = ${members.userId}
        and tm.left_at is null and tm.deleted_at is null
    )`;

    const rows = await this.db
      .select({
        userId: members.userId,
        username: users.username,
        displayName: users.displayName,
        bio: users.bio,
        points: members.points,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.userId))
      .where(and(isNull(users.deletedAt), sql`not ${inActiveTeamSql}`))
      .orderBy(desc(members.points))
      .limit(30);

    if (rows.length === 0) return [];

    const skillRows = await this.db
      .select({
        userId: memberSkills.userId,
        name: skills.name,
      })
      .from(memberSkills)
      .innerJoin(skills, eq(memberSkills.skillId, skills.skillId))
      .where(
        inArray(
          memberSkills.userId,
          rows.map((r) => r.userId),
        ),
      );

    const skillMap = new Map<string, string[]>();
    for (const s of skillRows) {
      const list = skillMap.get(s.userId) ?? [];
      list.push(s.name);
      skillMap.set(s.userId, list);
    }

    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      bio: r.bio,
      points: Number(r.points),
      skills: skillMap.get(r.userId) ?? [],
    }));
  }

  /** POST /teams — create a team, caller becomes leader. */
  async create(userId: string, input: CreateTeamInput): Promise<TeamDto> {
    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    if (!member) {
      throw new BadRequestException("Only members can create a team");
    }

    const [hackathon] = await this.db
      .select({
        hackathonId: hackathons.hackathonId,
        status: hackathons.status,
        maxTeamSize: hackathons.maxTeamSize,
      })
      .from(hackathons)
      .where(and(eq(hackathons.hackathonId, input.hackathonId), isNull(hackathons.deletedAt)))
      .limit(1);
    if (!hackathon) throw new NotFoundException("Hackathon not found");
    if (hackathon.status !== "upcoming") {
      throw new BadRequestException("Registration is closed — hackathon is no longer upcoming");
    }

    if (await this.hasActiveTeamInHackathon(userId, input.hackathonId)) {
      throw new ConflictException("You already have a team in this hackathon");
    }

    // Teammates the leader picked to invite on creation — capped at
    // maxTeamSize - 1 (the leader themselves fills the first slot).
    const inviteeUserIds = Array.from(new Set(input.inviteeUserIds ?? [])).filter(
      (id) => id !== userId,
    );
    if (inviteeUserIds.length > hackathon.maxTeamSize - 1) {
      throw new BadRequestException(
        `You can invite at most ${hackathon.maxTeamSize - 1} teammates for this hackathon`,
      );
    }

    const teamId = await this.db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({ hackathonId: input.hackathonId, name: input.name })
        .returning({ teamId: teams.teamId });

      await tx.insert(teamMembers).values({
        teamId: team.teamId,
        userId,
        role: "leader",
      });

      return team.teamId;
    });

    await this.createTeamChannel(teamId, input.hackathonId, input.name);

    // Creating a team does not admit it into the hackathon — the leader still
    // needs the organizer to approve a hackathon application. File one on
    // their behalf (best-effort: skip silently if the hackathon requires a
    // custom application form, closed registration, etc. — the leader can
    // still apply manually from the hackathon page in that case). Uses
    // createTeam() rather than create() so a pre-existing solo application
    // (e.g. the leader applied before forming this team) gets relinked to
    // the new team instead of silently staying orphaned.
    await this.applicationsService
      .createTeam(userId, { hackathonId: input.hackathonId, teamId, answers: [] })
      .catch(() => undefined);

    // Only invite the teammates the leader explicitly picked — team formation
    // is opt-in per invitee, not a blast to every other hackathon applicant.
    // Each invite still goes through the normal pending-invitation flow
    // (Invites tab, accept/decline).
    for (const inviteeId of inviteeUserIds) {
      await this.invite(teamId, userId, { userId: inviteeId }).catch(() => undefined);
    }

    return this.buildTeamDto(teamId, userId);
  }

  /**
   * Best-effort: creates a `team` channel in the hackathon server's "TIMOVI"
   * group. Silently skips if the server or group doesn't exist; never throws.
   */
  private async createTeamChannel(
    teamId: string,
    hackathonId: string,
    teamName: string,
  ): Promise<void> {
    try {
      const [server] = await this.db
        .select({ serverId: servers.serverId })
        .from(servers)
        .where(eq(servers.hackathonId, hackathonId))
        .limit(1);
      if (!server) return;

      const groupRows = await this.db
        .select({ groupId: channelGroups.groupId, name: channelGroups.name })
        .from(channelGroups)
        .where(eq(channelGroups.serverId, server.serverId))
        .orderBy(asc(channelGroups.position));
      if (groupRows.length === 0) return;

      // Fall back to the last channel group if the expected "TIMOVI" group was renamed/removed.
      const targetGroup =
        groupRows.find((g) => g.name === "TIMOVI") ?? groupRows[groupRows.length - 1];

      const [{ maxPos }] = await this.db
        .select({ maxPos: sql<number>`coalesce(max(${channels.position}), -1)` })
        .from(channels)
        .where(and(eq(channels.groupId, targetGroup.groupId), isNull(channels.deletedAt)));

      const position = Number(maxPos) + 1;

      try {
        await this.db.insert(channels).values({
          groupId: targetGroup.groupId,
          type: "team",
          name: teamName.slice(0, 100),
          teamId,
          position,
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Name conflict — retry with short teamId suffix
        await this.db.insert(channels).values({
          groupId: targetGroup.groupId,
          type: "team",
          name: `${teamName.slice(0, 93)}-${teamId.slice(0, 4)}`,
          teamId,
          position,
        });
      }
    } catch {
      // Non-critical side effect — do not fail team creation
    }
  }

  /** POST /teams/:teamId/join — join an open team as a member. */
  async join(userId: string, teamId: string): Promise<TeamDto> {
    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    if (!member) {
      throw new BadRequestException("Only members can join a team");
    }

    const [team] = await this.db
      .select({
        teamId: teams.teamId,
        hackathonId: teams.hackathonId,
        maxTeamSize: hackathons.maxTeamSize,
      })
      .from(teams)
      .innerJoin(hackathons, eq(teams.hackathonId, hackathons.hackathonId))
      .where(and(eq(teams.teamId, teamId), isNull(teams.deletedAt)))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    const [existing] = await this.db
      .select({
        userId: teamMembers.userId,
        leftAt: teamMembers.leftAt,
        deletedAt: teamMembers.deletedAt,
      })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    if (existing && existing.leftAt === null && existing.deletedAt === null) {
      throw new ConflictException("Already a member of this team");
    }

    if (await this.hasActiveTeamInHackathon(userId, team.hackathonId)) {
      throw new ConflictException("You already have a team in this hackathon");
    }

    const [{ value: activeCount }] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), activeTeamMember));
    if (Number(activeCount) >= Number(team.maxTeamSize)) {
      throw new BadRequestException("Team is full");
    }

    if (existing) {
      // Re-activate a previously-left / soft-deleted membership row (PK exists).
      await this.db
        .update(teamMembers)
        .set({
          role: "member",
          leftAt: null,
          deletedAt: null,
          joinedAt: new Date(),
        })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    } else {
      await this.db.insert(teamMembers).values({
        teamId,
        userId,
        role: "member",
      });
    }

    // Joining a team doesn't admit the new member into the hackathon either —
    // mirror what create() does for the leader by filing an application on
    // their behalf (best-effort). createTeam() also catches up any earlier
    // teammate who was never filed, so the whole roster stays eligible for
    // the organizer's "Approve Team" action and the resulting cohor access.
    await this.applicationsService
      .createTeam(userId, { hackathonId: team.hackathonId, teamId, answers: [] })
      .catch(() => undefined);

    return this.buildTeamDto(teamId, userId);
  }

  /* ── Join requests + invitations ──────────────────────────── */

  /** Inserts a team-related notification for one user. */
  private async notifyTeam(
    userId: string,
    type: TeamNotifType,
    template: NotificationTemplateRef,
    teamId: string,
  ): Promise<void> {
    await this.notifications.create({
      userId,
      type,
      template,
      entityType: "team",
      entityId: teamId,
    });
  }

  /** Throws unless `userId` is an active leader of `teamId`. */
  private async assertLeader(teamId: string, userId: string): Promise<void> {
    const [leader] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          eq(teamMembers.role, "leader"),
          activeTeamMember,
        ),
      )
      .limit(1);
    if (!leader) {
      throw new ForbiddenException("Only the team leader can do this");
    }
  }

  private async isActiveMember(teamId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), activeTeamMember))
      .limit(1);
    return Boolean(row);
  }

  /** A user may lead/belong to at most one active team per hackathon. */
  private async hasActiveTeamInHackathon(userId: string, hackathonId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teams.hackathonId, hackathonId),
          isNull(teams.deletedAt),
          activeTeamMember,
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** POST /teams/:teamId/join-requests — a member requests to join. */
  async requestToJoin(
    userId: string,
    teamId: string,
    input: JoinRequestInput,
  ): Promise<JoinRequestDto> {
    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    if (!member) throw new BadRequestException("Only members can join a team");

    const [team] = await this.db
      .select({ teamId: teams.teamId, hackathonId: teams.hackathonId })
      .from(teams)
      .where(and(eq(teams.teamId, teamId), isNull(teams.deletedAt)))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    if (await this.isActiveMember(teamId, userId)) {
      throw new ConflictException("Already a member of this team");
    }

    if (await this.hasActiveTeamInHackathon(userId, team.hackathonId)) {
      throw new ConflictException("You already have a team in this hackathon");
    }

    const [pending] = await this.db
      .select({ requestId: teamJoinRequests.requestId })
      .from(teamJoinRequests)
      .where(
        and(
          eq(teamJoinRequests.teamId, teamId),
          eq(teamJoinRequests.userId, userId),
          eq(teamJoinRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) throw new ConflictException("You already have a pending request");

    const [row] = await this.db
      .insert(teamJoinRequests)
      .values({ teamId, userId, message: input.message ?? null })
      .returning();
    const [u] = await this.db
      .select({ username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    // Notify the team leader of the new request.
    const [lead] = await this.db
      .select({ leaderId: teamMembers.userId, teamName: teams.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "leader"), activeTeamMember))
      .limit(1);
    if (lead) {
      await this.notifyTeam(
        lead.leaderId,
        "team_request_received",
        u
          ? {
              key: "team_request_received",
              params: { username: u.username, teamName: lead.teamName },
            }
          : { key: "team_request_received_anon", params: { teamName: lead.teamName } },
        teamId,
      );
    }

    return {
      requestId: row.requestId,
      teamId: row.teamId,
      userId: row.userId,
      username: u?.username ?? "",
      displayName: u?.displayName ?? null,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** GET /teams/:teamId/join-requests — leader sees pending requests. */
  async listJoinRequests(teamId: string, callerId: string): Promise<JoinRequestDto[]> {
    await this.assertLeader(teamId, callerId);
    const rows = await this.db
      .select({
        requestId: teamJoinRequests.requestId,
        teamId: teamJoinRequests.teamId,
        userId: teamJoinRequests.userId,
        username: users.username,
        displayName: users.displayName,
        message: teamJoinRequests.message,
        status: teamJoinRequests.status,
        createdAt: teamJoinRequests.createdAt,
      })
      .from(teamJoinRequests)
      .innerJoin(users, eq(users.userId, teamJoinRequests.userId))
      .where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.status, "pending")))
      .orderBy(desc(teamJoinRequests.createdAt));

    return rows.map((r) => ({
      requestId: r.requestId,
      teamId: r.teamId,
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** POST /teams/join-requests/:id/(accept|decline) — leader responds. */
  async respondJoinRequest(
    requestId: string,
    callerId: string,
    accept: boolean,
  ): Promise<{ success: true; status: string }> {
    const [req] = await this.db
      .select({
        requestId: teamJoinRequests.requestId,
        teamId: teamJoinRequests.teamId,
        userId: teamJoinRequests.userId,
        status: teamJoinRequests.status,
      })
      .from(teamJoinRequests)
      .where(eq(teamJoinRequests.requestId, requestId))
      .limit(1);
    if (!req) throw new NotFoundException("Request not found");
    await this.assertLeader(req.teamId, callerId);
    if (req.status !== "pending") {
      throw new BadRequestException("Request already handled");
    }

    // Join before updating status so a cap-full or conflict error aborts cleanly.
    if (accept) await this.join(req.userId, req.teamId);

    await this.db
      .update(teamJoinRequests)
      .set({
        status: accept ? "accepted" : "declined",
        respondedAt: new Date(),
        respondedBy: callerId,
      })
      .where(eq(teamJoinRequests.requestId, requestId));

    if (accept) {
      const [tm] = await this.db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.teamId, req.teamId))
        .limit(1);
      await this.notifyTeam(
        req.userId,
        "team_request_accepted",
        { key: "team_request_accepted", params: { teamName: tm?.name ?? "" } },
        req.teamId,
      );
    }

    return { success: true, status: accept ? "accepted" : "declined" };
  }

  /** POST /teams/:teamId/invitations — leader invites a member. */
  async invite(teamId: string, callerId: string, input: InviteInput): Promise<InvitationDto> {
    await this.assertLeader(teamId, callerId);

    const [member] = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.userId, input.userId))
      .limit(1);
    if (!member) throw new BadRequestException("Invitee must be a member");

    if (await this.isActiveMember(teamId, input.userId)) {
      throw new ConflictException("User is already on this team");
    }

    const [pending] = await this.db
      .select({ invitationId: teamInvitations.invitationId })
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.teamId, teamId),
          eq(teamInvitations.userId, input.userId),
          eq(teamInvitations.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) throw new ConflictException("Invitation already pending");

    const [row] = await this.db
      .insert(teamInvitations)
      .values({
        teamId,
        userId: input.userId,
        invitedBy: callerId,
        message: input.message ?? null,
      })
      .returning();

    const dto = await this.buildInvitationDto(row.invitationId);
    await this.notifyTeam(
      input.userId,
      "team_invitation_received",
      dto.invitedByUsername
        ? {
            key: "team_invitation_received",
            params: { username: dto.invitedByUsername, teamName: dto.teamName },
          }
        : { key: "team_invitation_received_anon", params: { teamName: dto.teamName } },
      teamId,
    );
    return dto;
  }

  /** GET /teams/invitations/me — caller's pending invitations. */
  async myInvitations(userId: string): Promise<InvitationDto[]> {
    const rows = await this.db
      .select({ invitationId: teamInvitations.invitationId })
      .from(teamInvitations)
      .where(and(eq(teamInvitations.userId, userId), eq(teamInvitations.status, "pending")))
      .orderBy(desc(teamInvitations.createdAt));

    return Promise.all(rows.map((r) => this.buildInvitationDto(r.invitationId)));
  }

  /** GET /teams/invitations/count — caller's pending invitation count. */
  async invitationCount(userId: string): Promise<{ count: number }> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(teamInvitations)
      .where(and(eq(teamInvitations.userId, userId), eq(teamInvitations.status, "pending")));
    return { count: Number(row?.value ?? 0) };
  }

  /** POST /teams/invitations/:id/(accept|decline) — invitee responds. */
  async respondInvitation(
    invitationId: string,
    userId: string,
    accept: boolean,
  ): Promise<{ success: true; status: string }> {
    const [inv] = await this.db
      .select({
        invitationId: teamInvitations.invitationId,
        teamId: teamInvitations.teamId,
        userId: teamInvitations.userId,
        status: teamInvitations.status,
      })
      .from(teamInvitations)
      .where(eq(teamInvitations.invitationId, invitationId))
      .limit(1);
    if (!inv) throw new NotFoundException("Invitation not found");
    if (inv.userId !== userId) {
      throw new ForbiddenException("This invitation is not yours");
    }
    if (inv.status !== "pending") {
      throw new BadRequestException("Invitation already handled");
    }

    // Same ordering as respondJoinRequest: join first so a full-team error aborts cleanly.
    if (accept) await this.join(userId, inv.teamId);

    await this.db
      .update(teamInvitations)
      .set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
      .where(eq(teamInvitations.invitationId, invitationId));

    // Let the leader know so they can invite someone else instead (SSU12 alt-flow 4).
    if (!accept) {
      const [u] = await this.db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.userId, userId))
        .limit(1);
      const [lead] = await this.db
        .select({ leaderId: teamMembers.userId, teamName: teams.name })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.teamId, teamMembers.teamId))
        .where(
          and(eq(teamMembers.teamId, inv.teamId), eq(teamMembers.role, "leader"), activeTeamMember),
        )
        .limit(1);
      if (lead) {
        await this.notifyTeam(
          lead.leaderId,
          "team_invitation_declined",
          u
            ? {
                key: "team_invitation_declined",
                params: { username: u.username, teamName: lead.teamName },
              }
            : { key: "team_invitation_declined_anon", params: { teamName: lead.teamName } },
          inv.teamId,
        );
      }
    }

    return { success: true, status: accept ? "accepted" : "declined" };
  }

  private async buildInvitationDto(invitationId: string): Promise<InvitationDto> {
    const [row] = await this.db
      .select({
        invitationId: teamInvitations.invitationId,
        teamId: teamInvitations.teamId,
        teamName: teams.name,
        hackathonTitle: hackathons.title,
        invitedByUsername: users.username,
        invitedByDisplayName: users.displayName,
        message: teamInvitations.message,
        status: teamInvitations.status,
        createdAt: teamInvitations.createdAt,
      })
      .from(teamInvitations)
      .innerJoin(teams, eq(teams.teamId, teamInvitations.teamId))
      .innerJoin(hackathons, eq(hackathons.hackathonId, teams.hackathonId))
      .leftJoin(users, eq(users.userId, teamInvitations.invitedBy))
      .where(eq(teamInvitations.invitationId, invitationId))
      .limit(1);
    if (!row) throw new NotFoundException("Invitation not found");

    return {
      invitationId: row.invitationId,
      teamId: row.teamId,
      teamName: row.teamName,
      hackathonTitle: row.hackathonTitle,
      invitedByUsername: row.invitedByUsername,
      invitedByDisplayName: row.invitedByDisplayName,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "23505"
  );
}
