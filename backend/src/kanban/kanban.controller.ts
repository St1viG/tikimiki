import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  createCardSchema,
  createColumnSchema,
  reorderColumnsSchema,
  updateCardSchema,
  updateColumnSchema,
  type CreateCardInput,
  type CreateColumnInput,
  type ReorderColumnsInput,
  type UpdateCardInput,
  type UpdateColumnInput,
} from "./dto";
import { KanbanService } from "./kanban.service";

@Controller()
export class KanbanController {
  constructor(private readonly kanban: KanbanService) {}

  @Get("teams/:teamId/kanban")
  @UseGuards(JwtAuthGuard)
  getBoard(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
  ) {
    return this.kanban.getBoard(teamId, userId);
  }

  /* ── Cards ──────────────────────────────────────────────── */

  @Post("teams/:teamId/kanban/cards")
  @UseGuards(JwtAuthGuard)
  createCard(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Body(new ZodValidationPipe(createCardSchema)) body: CreateCardInput,
  ) {
    return this.kanban.createCard(teamId, userId, body);
  }

  @Patch("kanban/cards/:cardId")
  @UseGuards(JwtAuthGuard)
  updateCard(
    @CurrentUser() userId: string,
    @Param("cardId", ParseUUIDPipe) cardId: string,
    @Body(new ZodValidationPipe(updateCardSchema)) body: UpdateCardInput,
  ) {
    return this.kanban.updateCard(cardId, userId, body);
  }

  @Delete("kanban/cards/:cardId")
  @UseGuards(JwtAuthGuard)
  deleteCard(
    @CurrentUser() userId: string,
    @Param("cardId", ParseUUIDPipe) cardId: string,
  ) {
    return this.kanban.deleteCard(cardId, userId);
  }

  /* ── Columns ────────────────────────────────────────────── */

  @Post("teams/:teamId/kanban/columns")
  @UseGuards(JwtAuthGuard)
  createColumn(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Body(new ZodValidationPipe(createColumnSchema)) body: CreateColumnInput,
  ) {
    return this.kanban.createColumn(teamId, userId, body);
  }

  @Patch("kanban/columns/:columnId")
  @UseGuards(JwtAuthGuard)
  updateColumn(
    @CurrentUser() userId: string,
    @Param("columnId", ParseUUIDPipe) columnId: string,
    @Body(new ZodValidationPipe(updateColumnSchema)) body: UpdateColumnInput,
  ) {
    return this.kanban.updateColumn(columnId, userId, body);
  }

  @Delete("kanban/columns/:columnId")
  @UseGuards(JwtAuthGuard)
  deleteColumn(
    @CurrentUser() userId: string,
    @Param("columnId", ParseUUIDPipe) columnId: string,
  ) {
    return this.kanban.deleteColumn(columnId, userId);
  }

  @Put("teams/:teamId/kanban/columns/order")
  @UseGuards(JwtAuthGuard)
  reorderColumns(
    @CurrentUser() userId: string,
    @Param("teamId", ParseUUIDPipe) teamId: string,
    @Body(new ZodValidationPipe(reorderColumnsSchema)) body: ReorderColumnsInput,
  ) {
    return this.kanban.reorderColumns(teamId, userId, body);
  }
}
