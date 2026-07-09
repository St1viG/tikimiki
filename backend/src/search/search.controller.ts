/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { SearchQuerySchema, type SearchQuery } from "./dto";

/** Global search across users, organizations and hackathons. Public endpoint. */
@Controller("search")
export class SearchController {
  /**
   * `GET /search?q=`. Personalises nothing yet (hence `OptionalJwtAuthGuard`
   * rather than a hard login requirement) — currently a placeholder with no
   * database lookups.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  search(@Query(new ZodValidationPipe(SearchQuerySchema)) _query: SearchQuery) {
    return { users: [], organizations: [], hackathons: [] };
  }
}
