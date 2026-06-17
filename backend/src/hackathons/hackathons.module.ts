import { Module } from "@nestjs/common";
import { HackathonsController } from "./hackathons.controller";
import { HackathonsService } from "./hackathons.service";

@Module({
  controllers: [HackathonsController],
  providers: [HackathonsService],
})
export class HackathonsModule {}
