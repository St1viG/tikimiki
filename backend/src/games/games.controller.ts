import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { createPlaySchema, type CreatePlayInput } from "./dto";
import { GamesService } from "./games.service";

@Controller("games")
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list() {
    return this.games.listGames();
  }

  @Get("me/today")
  @UseGuards(JwtAuthGuard)
  today(@CurrentUser() userId: string) {
    return this.games.todayState(userId);
  }

  @Post(":gameId/plays")
  @UseGuards(JwtAuthGuard)
  play(
    @CurrentUser() userId: string,
    @Param("gameId", new ParseUUIDPipe()) gameId: string,
    @Body(new ZodValidationPipe(createPlaySchema)) body: CreatePlayInput,
  ) {
    return this.games.recordPlay(userId, gameId, body.score, body.perfect ?? false);
  }

  @Get(":gameId/leaderboard")
  leaderboard(@Param("gameId", new ParseUUIDPipe()) gameId: string) {
    return this.games.leaderboard(gameId);
  }
}
