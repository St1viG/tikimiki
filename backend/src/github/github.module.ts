/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { Module } from "@nestjs/common";
import { GithubController } from "./github.controller";
import { GithubService } from "./github.service";

/** GithubModule — repo/language stats + verified-skill sync endpoint. */
@Module({
  controllers: [GithubController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
