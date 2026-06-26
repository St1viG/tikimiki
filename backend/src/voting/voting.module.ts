import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VotingController } from "./voting.controller";
import { VotingService } from "./voting.service";

@Module({
  imports: [AuthModule],
  controllers: [VotingController],
  providers: [VotingService],
})
export class VotingModule {}
