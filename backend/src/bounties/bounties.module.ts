import { Module } from "@nestjs/common";
import { BountiesController } from "./bounties.controller";
import { BountiesService } from "./bounties.service";

@Module({
  controllers: [BountiesController],
  providers: [BountiesService],
})
export class BountiesModule {}
