import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { EngagementModule } from "../engagement/engagement.module";
import { PostsModule } from "../posts/posts.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [AuthModule, PostsModule, EngagementModule, AdminModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
