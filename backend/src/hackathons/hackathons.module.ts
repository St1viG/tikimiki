import { Module } from "@nestjs/common";
import { HackathonsController } from "./hackathons.controller";
import { HackathonsService } from "./hackathons.service";
import { HackathonsStatusScheduler } from "./hackathons-status.scheduler";

@Module({
  controllers: [HackathonsController],
  providers: [HackathonsService, HackathonsStatusScheduler],
})
export class HackathonsModule {}
