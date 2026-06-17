import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { activeTeamMember } from "../common/team.predicates";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  kanbanBoards,
  kanbanCards,
  kanbanColumns,
  teamMembers,
  teams,
  users,
} from "../db/schema";
import type { CreateCardInput, UpdateCardInput } from "./dto";

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
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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

  /** Resolves the teamId that owns the column a card lives in. */
  private async teamForCard(cardId: string): Promise<{
    teamId: string;
    columnId: string;
    boardId: string;
  }> {
    const [row] = await this.db
      .select({
        teamId: kanbanBoards.teamId,
        columnId: kanbanCards.columnId,
        boardId: kanbanBoards.boardId,
      })
      .from(kanbanCards)
      .innerJoin(kanbanColumns, eq(kanbanColumns.columnId, kanbanCards.columnId))
      .innerJoin(kanbanBoards, eq(kanbanBoards.boardId, kanbanColumns.boardId))
      .where(and(eq(kanbanCards.cardId, cardId), isNull(kanbanCards.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Card not found");
    return row;
  }

  /** Builds a CardDto from a raw card row + optional assignee username. */
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

  /** Loads a single card (active) by id, joined to its assignee username. */
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

  /** GET /teams/:teamId/kanban — fetch (or lazily create) the board. */
  async getBoard(teamId: string, userId: string): Promise<BoardDto> {
    await this.assertTeamMember(teamId, userId);

    // Ensure the team exists (active).
    const [team] = await this.db
      .select({ teamId: teams.teamId })
      .from(teams)
      .where(and(eq(teams.teamId, teamId), isNull(teams.deletedAt)))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    let [board] = await this.db
      .select({ boardId: kanbanBoards.boardId, teamId: kanbanBoards.teamId })
      .from(kanbanBoards)
      .where(eq(kanbanBoards.teamId, teamId))
      .limit(1);

    if (!board) {
      board = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(kanbanBoards)
          .values({ teamId })
          .returning({
            boardId: kanbanBoards.boardId,
            teamId: kanbanBoards.teamId,
          });
        await tx.insert(kanbanColumns).values(
          DEFAULT_COLUMNS.map((c) => ({
            boardId: created.boardId,
            name: c.name,
            position: c.position,
          })),
        );
        return created;
      });
    }

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

  /** POST /teams/:teamId/kanban/cards — create a card in a column. */
  async createCard(
    teamId: string,
    userId: string,
    input: CreateCardInput,
  ): Promise<CardDto> {
    await this.assertTeamMember(teamId, userId);

    // Verify the column belongs to this team's board.
    const [column] = await this.db
      .select({ columnId: kanbanColumns.columnId })
      .from(kanbanColumns)
      .innerJoin(kanbanBoards, eq(kanbanBoards.boardId, kanbanColumns.boardId))
      .where(
        and(
          eq(kanbanColumns.columnId, input.columnId),
          eq(kanbanBoards.teamId, teamId),
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

    return this.loadCard(created.cardId);
  }

  /** PATCH /kanban/cards/:cardId — update/move a card. */
  async updateCard(
    cardId: string,
    userId: string,
    input: UpdateCardInput,
  ): Promise<CardDto> {
    const card = await this.teamForCard(cardId);
    await this.assertTeamMember(card.teamId, userId);

    // If moving to a different column, verify it belongs to the same board.
    if (input.columnId !== undefined && input.columnId !== card.columnId) {
      const [target] = await this.db
        .select({ columnId: kanbanColumns.columnId })
        .from(kanbanColumns)
        .where(
          and(
            eq(kanbanColumns.columnId, input.columnId),
            eq(kanbanColumns.boardId, card.boardId),
          ),
        )
        .limit(1);
      if (!target) {
        throw new NotFoundException("Target column not found on this board");
      }
    }

    // If assigning, verify the assignee is an active member of the team.
    if (input.assignedTo) {
      await this.assertAssigneeIsMember(card.teamId, input.assignedTo);
    }

    // Moving to a different column without an explicit position must append to
    // the END of the target column — otherwise the card keeps its old position
    // and collides with the target's (column, position) unique index. This is
    // the common drag-and-drop case (only columnId is sent).
    const movingColumn =
      input.columnId !== undefined && input.columnId !== card.columnId;
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

    return this.loadCard(cardId);
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

  /** DELETE /kanban/cards/:cardId — soft-delete a card. */
  async deleteCard(
    cardId: string,
    userId: string,
  ): Promise<{ success: true }> {
    const card = await this.teamForCard(cardId);
    await this.assertTeamMember(card.teamId, userId);

    await this.db
      .update(kanbanCards)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(kanbanCards.cardId, cardId));

    return { success: true };
  }
}
