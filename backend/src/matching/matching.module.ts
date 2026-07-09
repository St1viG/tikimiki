/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Module } from "@nestjs/common";
import { MatchingController } from "./matching.controller";
import { MatchingService } from "./matching.service";

/** MatchingModule — teammate/team suggestions for a hackathon. */
@Module({
  controllers: [MatchingController],
  providers: [MatchingService],
})
export class MatchingModule {}
