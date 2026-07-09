/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { z } from "zod";

/**
 * Query for `GET /search`. `q` is the only hard requirement for now; optional
 * filters (skills, location, type, minPrize) will be added here once the
 * underlying search queries support them.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1),
  // TODO: skills, location, type, minPrize
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
