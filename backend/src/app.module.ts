import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AdminModule } from "./admin/admin.module";
import { ApplicationsModule } from "./applications/applications.module";
import { AuthModule } from "./auth/auth.module";
import { BountiesModule } from "./bounties/bounties.module";
import { ChatModule } from "./chat/chat.module";
import { AuthzModule } from "./common/authz.module";
import { DbModule } from "./db/db.module";
import { EngagementModule } from "./engagement/engagement.module";
import { GamesModule } from "./games/games.module";
import { GithubModule } from "./github/github.module";
import { HackathonsModule } from "./hackathons/hackathons.module";
import { HealthModule } from "./health/health.module";
import { KanbanModule } from "./kanban/kanban.module";
import { LeaderboardModule } from "./leaderboard/leaderboard.module";
import { MailModule } from "./mail/mail.module";
import { MatchingModule } from "./matching/matching.module";
import { ModerationModule } from "./moderation/moderation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PostsModule } from "./posts/posts.module";
import { ProjectsModule } from "./projects/projects.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ReportsModule } from "./reports/reports.module";
import { SearchModule } from "./search/search.module";
import { SettingsModule } from "./settings/settings.module";
import { SocialModule } from "./social/social.module";
import { StoreModule } from "./store/store.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { TeamsModule } from "./teams/teams.module";
import { UploadsModule } from "./uploads/uploads.module";
import { UsersModule } from "./users/users.module";
import { VotingModule } from "./voting/voting.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DbModule,
    RealtimeModule,
    AuthzModule,
    HealthModule,
    AuthModule,
    HackathonsModule,
    PostsModule,
    EngagementModule,
    NotificationsModule,
    ChatModule,
    UsersModule,
    TeamsModule,
    ApplicationsModule,
    GamesModule,
    GithubModule,
    StoreModule,
    SubscriptionsModule,
    ReportsModule,
    AdminModule,
    VotingModule,
    ProjectsModule,
    KanbanModule,
    LeaderboardModule,
    MailModule,
    MatchingModule,
    ModerationModule,
    UploadsModule,
    BountiesModule,
    SettingsModule,
    SocialModule,
    SearchModule,
  ],
})
export class AppModule {}
