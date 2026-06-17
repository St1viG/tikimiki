import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  createCardSchema,
  updateCardSchema,
  type CreateCardInput,
  type UpdateCardInput,
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
}
