/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Module } from "@nestjs/common";
import { TeamsModule } from "../teams/teams.module";
import { MatchingController } from "./matching.controller";
import { MatchingService } from "./matching.service";

/** MatchingModule — teammate/team suggestions for a hackathon. */
@Module({
  imports: [TeamsModule],
  controllers: [MatchingController],
  providers: [MatchingService],
})
export class MatchingModule {}
