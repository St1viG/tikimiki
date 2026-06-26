import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

/**
 * ProjectsModule — team project submissions (the central hackathon deliverable).
 * Teams draft a project, then submit it for audience voting (VotingModule) and
 * judging (BountiesModule results). Read by voting/bounties; written only here.
 */
@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
