/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Module } from "@nestjs/common";
import { MatchingController } from "./matching.controller";

/** MatchingModule — teammate/team suggestions for a hackathon. Service arrives in D02. */
@Module({
  controllers: [MatchingController],
  providers: [],
})
export class MatchingModule {}
