/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";

/** SearchModule — global search across users, organizations and hackathons. */
@Module({
  controllers: [SearchController],
})
export class SearchModule {}
