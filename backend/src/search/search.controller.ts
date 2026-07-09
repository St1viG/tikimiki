/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { SearchQuerySchema, type SearchQuery } from "./dto";
import { SearchService } from "./search.service";

/** Global search across users, organizations and hackathons. Public endpoint. */
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * `GET /search?q=`. Personalises nothing yet (hence `OptionalJwtAuthGuard`
   * rather than a hard login requirement).
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  search(@Query(new ZodValidationPipe(SearchQuerySchema)) query: SearchQuery) {
    return this.searchService.search(query);
  }
}
