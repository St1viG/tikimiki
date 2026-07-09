/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { Module } from "@nestjs/common";
import { GithubService } from "./github.service";

/** GithubModule — repo/language stats for skill verification. Controller lands in N04. */
@Module({
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
