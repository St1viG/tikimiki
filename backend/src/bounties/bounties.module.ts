import { Module } from "@nestjs/common";
import { PointsService } from "../common/points.service";
import { BountiesController } from "./bounties.controller";
import { BountiesService } from "./bounties.service";

@Module({
  controllers: [BountiesController],
  providers: [BountiesService, PointsService],
})
export class BountiesModule {}
