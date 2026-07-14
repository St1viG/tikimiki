import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CosmeticsService } from "../common/cosmetics.service";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

@Module({
  imports: [AuthModule],
  controllers: [PostsController],
  providers: [PostsService, CosmeticsService],
  exports: [PostsService],
})
export class PostsModule {}
