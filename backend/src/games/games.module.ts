import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PointsService } from "../common/points.service";
import { GamesController } from "./games.controller";
import { GamesService } from "./games.service";

@Module({
  imports: [AuthModule],
  controllers: [GamesController],
  providers: [GamesService, PointsService],
})
export class GamesModule {}
