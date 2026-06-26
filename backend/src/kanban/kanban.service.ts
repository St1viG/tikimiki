import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { activeTeamMember } from "../common/team.predicates";
import { AuthzService } from "../common/authz.service";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  hackathons,
  kanbanBoards,
  kanbanCards,
  kanbanColumns,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import type {
  CreateCardInput,
  CreateColumnInput,
  ReorderColumnsInput,
  UpdateCardInput,
  UpdateColumnInput,
} from "./dto";

/* ── response shapes ──────────────────────────────────────── */

export interface CardDto {
  cardId: string;
  columnId: string;
  title: string;
  description: string | null;
  assignedTo: string | null;
  assignedToUsername: string | null;
  position: number;
  createdAt: string;
}

export interface ColumnDto {
  columnId: string;
  name: string;
  position: number;
  cards: CardDto[];
}

export interface BoardDto {
  boardId: string;
  teamId: string;
  columns: ColumnDto[];
}

/* ── internal helpers ─────────────────────────────────────── */

const DEFAULT_COLUMNS: ReadonlyArray<{ name: string; position: number }> = [
  { name: "To do", position: 0 },
  { name: "In progress", position: 1 },
  { name: "Done", position: 2 },
];

@Injectable()
export class KanbanService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly authz: AuthzService,
  ) {}

  /** Throws ForbiddenException unless `userId` is an active member of `teamId`. */
  private async assertTeamMember(
    teamId: string,
    userId: string,
  ): Promise<void> {
    const [row] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          activeTeamMember,
        ),
      )
      .limit(1);
    if (!row) {
      throw new ForbiddenException("Not an active member of this team");
    }
  }

  /**
   * Allows team members, platform admins, and the hackathon organizer to view
   * the board. Write endpoints still require full team membership.
   */
  private async assertBoardReadAccess(
    teamId: string,
    userId: string,
  ): Promise<void> {
    const [member] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          activeTeamMember,
        ),
      )
      .limit(1);
    if (member) return;

    if (await this.authz.isAdmin(userId)) return;

    const [row] = await this.db
      .select({ organizationId: hackathons.organizationId })
      .from(teams)
      .innerJoin(hackathons, eq(hackathons.hackathonId, teams.hackathonId))
      .where(and(eq(teams.teamId, teamId), isNull(teams.deletedAt)))
      .limit(1);
    if (row?.organizationId === userId) return;

    throw new ForbiddenException("Not an active member of this team");
  }

  /** Throws unless `assigneeId` is an active member of `teamId`. */
  private async assertAssigneeIsMember(
    teamId: string,
    assigneeId: string,
  ): Promise<void> {
    const [row] = await this.db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, assigneeId),
          activeTeamMember,
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException("Assignee is not an active team member");
    }
  }

  /** Resolves context from a card id. */
  private async teamForCard(cardId: string): Promise<{
    teamId: string;
    columnId: string;
    boardId: string;
    assignedTo: string | null;
  }> {
    const [row] = await this.db
      .select({
        teamId: kanbanBoards.teamId,
        columnId: kanbanCards.columnId,
        boardId: kanbanBoards.boardId,
        assignedTo: kanbanCards.assignedTo,
      })
      .from(kanbanCards)
      .innerJoin(kanbanColumns, eq(kanbanColumns.columnId, kanbanCards.columnId))
      .innerJoin(kanbanBoards, eq(kanbanBoards.boardId, kanbanColumns.boardId))
      .where(and(eq(kanbanCards.cardId, cardId), isNull(kanbanCards.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Card not found");
    return row;
  }

  /** Resolves context from a column id. */
  private async boardForColumn(columnId: string): Promise<{
    boardId: string;
    teamId: string;
  }> {
    const [row] = await this.db
      .select({
        boardId: kanbanBoards.boardId,
        teamId: kanbanBoards.teamId,
      })
      .from(kanbanColumns)
      .innerJoin(kanbanBoards, eq(kanbanBoards.boardId, kanbanColumns.boardId))
      .where(eq(kanbanColumns.columnId, columnId))
      .limit(1);
    if (!row) throw new NotFoundException("Column not found");
    return row;
  }

  /** Finds or lazily creates the board for a team. Verifies the team exists. */
  private async ensureBoard(
    teamId: string,
  ): Promise<{ boardId: string; teamId: string }> {
    const [existing] = await this.db
      .select({ boardId: kanbanBoards.boardId, teamId: kanbanBoards.teamId })
      .from(kanbanBoards)
      .where(eq(kanbanBoards.teamId, teamId))
      .limit(1);

    if (existing) return existing;

    const [team] = await this.db
      .select({ teamId: teams.teamId })
      .from(teams)
      .where(and(eq(teams.teamId, teamId), isNull(teams.deletedAt)))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    return this.db.transaction(async (tx) => {
      const [board] = await tx
        .insert(kanbanBoards)
        .values({ teamId })
        .returning({
          boardId: kanbanBoards.boardId,
          teamId: kanbanBoards.teamId,
        });
      await tx.insert(kanbanColumns).values(
        DEFAULT_COLUMNS.map((c) => ({
          boardId: board.boardId,
          name: c.name,
          position: c.position,
        })),
      );
      return board;
    });
  }

  private toCardDto(row: {
    cardId: string;
    columnId: string;
    title: string;
    description: string | null;
    assignedTo: string | null;
    assignedToUsername: string | null;
    position: number;
    createdAt: Date;
  }): CardDto {
    return {
      cardId: row.cardId,
      columnId: row.columnId,
      title: row.title,
      description: row.description,
      assignedTo: row.assignedTo,
      assignedToUsername: row.assignedToUsername,
      position: Number(row.position),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async loadCard(cardId: string): Promise<CardDto> {
    const [row] = await this.db
      .select({
        cardId: kanbanCards.cardId,
        columnId: kanbanCards.columnId,
        title: kanbanCards.title,
        description: kanbanCards.description,
        assignedTo: kanbanCards.assignedTo,
        assignedToUsername: users.username,
        position: kanbanCards.position,
        createdAt: kanbanCards.createdAt,
      })
      .from(kanbanCards)
      .leftJoin(users, eq(users.userId, kanbanCards.assignedTo))
      .where(and(eq(kanbanCards.cardId, cardId), isNull(kanbanCards.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Card not found");
    return this.toCardDto(row);
  }

  /* ── Board ──────────────────────────────────────────────── */

  /** GET /teams/:teamId/kanban — fetch (or lazily create) the board. */
  async getBoard(teamId: string, userId: string): Promise<BoardDto> {
    await this.assertBoardReadAccess(teamId, userId);
    const board = await this.ensureBoard(teamId);

    const columns = await this.db
      .select({
        columnId: kanbanColumns.columnId,
        name: kanbanColumns.name,
        position: kanbanColumns.position,
      })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.boardId, board.boardId))
      .orderBy(asc(kanbanColumns.position));

    const cards = await this.db
      .select({
        cardId: kanbanCards.cardId,
        columnId: kanbanCards.columnId,
        title: kanbanCards.title,
        description: kanbanCards.description,
        assignedTo: kanbanCards.assignedTo,
        assignedToUsername: users.username,
        position: kanbanCards.position,
        createdAt: kanbanCards.createdAt,
      })
      .from(kanbanCards)
      .innerJoin(
        kanbanColumns,
        eq(kanbanColumns.columnId, kanbanCards.columnId),
      )
      .leftJoin(users, eq(users.userId, kanbanCards.assignedTo))
      .where(
        and(
          eq(kanbanColumns.boardId, board.boardId),
          isNull(kanbanCards.deletedAt),
        ),
      )
      .orderBy(asc(kanbanCards.position));

    const cardsByColumn = new Map<string, CardDto[]>();
    for (const c of cards) {
      const list = cardsByColumn.get(c.columnId) ?? [];
      list.push(this.toCardDto(c));
      cardsByColumn.set(c.columnId, list);
    }

    return {
      boardId: board.boardId,
      teamId: board.teamId,
      columns: columns.map((col) => ({
        columnId: col.columnId,
        name: col.name,
        position: Number(col.position),
        cards: cardsByColumn.get(col.columnId) ?? [],
      })),
    };
  }

  /* ── Cards ──────────────────────────────────────────────── */

  /** POST /teams/:teamId/kanban/cards */
  async createCard(
    teamId: string,
    userId: string,
    input: CreateCardInput,
  ): Promise<CardDto> {
    await this.assertTeamMember(teamId, userId);

    const board = await this.ensureBoard(teamId);

    const [column] = await this.db
      .select({ columnId: kanbanColumns.columnId })
      .from(kanbanColumns)
      .where(
        and(
          eq(kanbanColumns.columnId, input.columnId),
          eq(kanbanColumns.boardId, board.boardId),
        ),
      )
      .limit(1);
    if (!column) {
      throw new NotFoundException("Column not found on this team's board");
    }

    const [{ maxPos }] = await this.db
      .select({
        maxPos: sql<number>`coalesce(max(${kanbanCards.position}), -1)`,
      })
      .from(kanbanCards)
      .where(
        and(
          eq(kanbanCards.columnId, input.columnId),
          isNull(kanbanCards.deletedAt),
        ),
      );

    const [created] = await this.db
      .insert(kanbanCards)
      .values({
        columnId: input.columnId,
        createdBy: userId,
        title: input.title,
        description: input.description ?? null,
        position: Number(maxPos) + 1,
      })
      .returning({ cardId: kanbanCards.cardId });

    const card = await this.loadCard(created.cardId);
    this.realtime.emitKanbanUpdate(board.boardId, {
      type: "card:created",
      card,
    });
    return card;
  }

  /** PATCH /kanban/cards/:cardId */
  async updateCard(
    cardId: string,
    userId: string,
    input: UpdateCardInput,
  ): Promise<CardDto> {
    const prev = await this.teamForCard(cardId);
    await this.assertTeamMember(prev.teamId, userId);

    if (input.columnId !== undefined && input.columnId !== prev.columnId) {
      const [target] = await this.db
        .select({ columnId: kanbanColumns.columnId })
        .from(kanbanColumns)
        .where(
          and(
            eq(kanbanColumns.columnId, input.columnId),
            eq(kanbanColumns.boardId, prev.boardId),
          ),
        )
        .limit(1);
      if (!target) {
        throw new NotFoundException("Target column not found on this board");
      }
    }

    if (input.assignedTo) {
      await this.assertAssigneeIsMember(prev.teamId, input.assignedTo);
    }

    const movingColumn =
      input.columnId !== undefined && input.columnId !== prev.columnId;
    let resolvedPosition = input.position;
    if (movingColumn && input.position === undefined) {
      const [{ maxPos }] = await this.db
        .select({
          maxPos: sql<number>`coalesce(max(${kanbanCards.position}), -1)`,
        })
        .from(kanbanCards)
        .where(
          and(
            eq(kanbanCards.columnId, input.columnId as string),
            isNull(kanbanCards.deletedAt),
          ),
        );
      resolvedPosition = Number(maxPos) + 1;
    }

    const patch: Partial<typeof kanbanCards.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.columnId !== undefined) patch.columnId = input.columnId;
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (resolvedPosition !== undefined) patch.position = resolvedPosition;
    if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;

    await this.db
      .update(kanbanCards)
      .set(patch)
      .where(eq(kanbanCards.cardId, cardId));

    const card = await this.loadCard(cardId);

    // Notify the newly assigned member (skip if assigning to self).
    if (
      input.assignedTo !== undefined &&
      input.assignedTo !== null &&
      input.assignedTo !== prev.assignedTo &&
      input.assignedTo !== userId
    ) {
      void this.notifications.create({
        userId: input.assignedTo,
        type: "position_assigned",
        title: "Dodeljen vam je zadatak",
        body: card.title,
        entityType: "team",
        entityId: prev.teamId,
      });
    }

    this.realtime.emitKanbanUpdate(prev.boardId, {
      type: "card:updated",
      card,
    });
    return card;
  }

  /** DELETE /kanban/cards/:cardId */
  async deleteCard(
    cardId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const { teamId, boardId } = await this.teamForCard(cardId);
    await this.assertTeamMember(teamId, userId);

    await this.db
      .update(kanbanCards)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(kanbanCards.cardId, cardId));

    this.realtime.emitKanbanUpdate(boardId, {
      type: "card:deleted",
      cardId,
    });
    return { success: true };
  }

  /* ── Columns ────────────────────────────────────────────── */

  /** POST /teams/:teamId/kanban/columns */
  async createColumn(
    teamId: string,
    userId: string,
    input: CreateColumnInput,
  ): Promise<ColumnDto> {
    await this.assertTeamMember(teamId, userId);
    const board = await this.ensureBoard(teamId);

    const [{ maxPos }] = await this.db
      .select({
        maxPos: sql<number>`coalesce(max(${kanbanColumns.position}), -1)`,
      })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.boardId, board.boardId));

    const [created] = await this.db
      .insert(kanbanColumns)
      .values({
        boardId: board.boardId,
        name: input.name,
        position: Number(maxPos) + 1,
      })
      .returning({
        columnId: kanbanColumns.columnId,
        name: kanbanColumns.name,
        position: kanbanColumns.position,
      });

    const col: ColumnDto = {
      columnId: created.columnId,
      name: created.name,
      position: Number(created.position),
      cards: [],
    };
    this.realtime.emitKanbanUpdate(board.boardId, {
      type: "column:created",
      column: col,
    });
    return col;
  }

  /** PATCH /kanban/columns/:columnId — rename */
  async updateColumn(
    columnId: string,
    userId: string,
    input: UpdateColumnInput,
  ): Promise<ColumnDto> {
    const { boardId, teamId } = await this.boardForColumn(columnId);
    await this.assertTeamMember(teamId, userId);

    const [updated] = await this.db
      .update(kanbanColumns)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(kanbanColumns.columnId, columnId))
      .returning({
        columnId: kanbanColumns.columnId,
        name: kanbanColumns.name,
        position: kanbanColumns.position,
      });

    const rawCards = await this.db
      .select({
        cardId: kanbanCards.cardId,
        columnId: kanbanCards.columnId,
        title: kanbanCards.title,
        description: kanbanCards.description,
        assignedTo: kanbanCards.assignedTo,
        assignedToUsername: users.username,
        position: kanbanCards.position,
        createdAt: kanbanCards.createdAt,
      })
      .from(kanbanCards)
      .leftJoin(users, eq(users.userId, kanbanCards.assignedTo))
      .where(
        and(
          eq(kanbanCards.columnId, columnId),
          isNull(kanbanCards.deletedAt),
        ),
      )
      .orderBy(asc(kanbanCards.position));

    const col: ColumnDto = {
      columnId: updated.columnId,
      name: updated.name,
      position: Number(updated.position),
      cards: rawCards.map((c) => this.toCardDto(c)),
    };
    this.realtime.emitKanbanUpdate(boardId, { type: "column:updated", column: col });
    return col;
  }

  /** DELETE /kanban/columns/:columnId — migrates cards to the first other column. */
  async deleteColumn(
    columnId: string,
    userId: string,
  ): Promise<{ success: true; movedCards: number }> {
    const { boardId, teamId } = await this.boardForColumn(columnId);
    await this.assertTeamMember(teamId, userId);

    const allCols = await this.db
      .select({
        columnId: kanbanColumns.columnId,
        position: kanbanColumns.position,
      })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.boardId, boardId))
      .orderBy(asc(kanbanColumns.position));

    if (allCols.length <= 1) {
      throw new BadRequestException("Cannot delete the only column");
    }

    const target = allCols.find((c) => c.columnId !== columnId)!;

    const activeCards = await this.db
      .select({ cardId: kanbanCards.cardId })
      .from(kanbanCards)
      .where(
        and(
          eq(kanbanCards.columnId, columnId),
          isNull(kanbanCards.deletedAt),
        ),
      )
      .orderBy(asc(kanbanCards.position));

    let movedCards = 0;
    if (activeCards.length > 0) {
      const [{ maxPos }] = await this.db
        .select({
          maxPos: sql<number>`coalesce(max(${kanbanCards.position}), -1)`,
        })
        .from(kanbanCards)
        .where(
          and(
            eq(kanbanCards.columnId, target.columnId),
            isNull(kanbanCards.deletedAt),
          ),
        );

      let pos = Number(maxPos) + 1;
      for (const card of activeCards) {
        await this.db
          .update(kanbanCards)
          .set({
            columnId: target.columnId,
            position: pos,
            updatedAt: new Date(),
          })
          .where(eq(kanbanCards.cardId, card.cardId));
        pos++;
      }
      movedCards = activeCards.length;
    }

    await this.db
      .delete(kanbanColumns)
      .where(eq(kanbanColumns.columnId, columnId));

    this.realtime.emitKanbanUpdate(boardId, {
      type: "column:deleted",
      columnId,
      movedCards,
    });
    return { success: true, movedCards };
  }

  /** PUT /teams/:teamId/kanban/columns/order — bulk reorder */
  async reorderColumns(
    teamId: string,
    userId: string,
    input: ReorderColumnsInput,
  ): Promise<ColumnDto[]> {
    await this.assertTeamMember(teamId, userId);
    const board = await this.ensureBoard(teamId);

    const existingCols = await this.db
      .select({ columnId: kanbanColumns.columnId })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.boardId, board.boardId));

    const boardColIds = new Set(existingCols.map((c) => c.columnId));
    for (const entry of input.columns) {
      if (!boardColIds.has(entry.columnId)) {
        throw new NotFoundException(
          `Column ${entry.columnId} not found on this board`,
        );
      }
    }

    await this.db.transaction(async (tx) => {
      for (const entry of input.columns) {
        await tx
          .update(kanbanColumns)
          .set({ position: entry.position, updatedAt: new Date() })
          .where(eq(kanbanColumns.columnId, entry.columnId));
      }
    });

    const updatedCols = await this.db
      .select({
        columnId: kanbanColumns.columnId,
        name: kanbanColumns.name,
        position: kanbanColumns.position,
      })
      .from(kanbanColumns)
      .where(eq(kanbanColumns.boardId, board.boardId))
      .orderBy(asc(kanbanColumns.position));

    const cards = await this.db
      .select({
        cardId: kanbanCards.cardId,
        columnId: kanbanCards.columnId,
        title: kanbanCards.title,
        description: kanbanCards.description,
        assignedTo: kanbanCards.assignedTo,
        assignedToUsername: users.username,
        position: kanbanCards.position,
        createdAt: kanbanCards.createdAt,
      })
      .from(kanbanCards)
      .innerJoin(kanbanColumns, eq(kanbanColumns.columnId, kanbanCards.columnId))
      .leftJoin(users, eq(users.userId, kanbanCards.assignedTo))
      .where(
        and(
          eq(kanbanColumns.boardId, board.boardId),
          isNull(kanbanCards.deletedAt),
        ),
      )
      .orderBy(asc(kanbanCards.position));

    const cardsByColumn = new Map<string, CardDto[]>();
    for (const c of cards) {
      const list = cardsByColumn.get(c.columnId) ?? [];
      list.push(this.toCardDto(c));
      cardsByColumn.set(c.columnId, list);
    }

    const result: ColumnDto[] = updatedCols.map((col) => ({
      columnId: col.columnId,
      name: col.name,
      position: Number(col.position),
      cards: cardsByColumn.get(col.columnId) ?? [],
    }));

    this.realtime.emitKanbanUpdate(board.boardId, {
      type: "columns:reordered",
      columns: result,
    });
    return result;
  }
}
