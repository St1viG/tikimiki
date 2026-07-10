/**
 * Zod schema + type for the `GET /search` query, including the optional
 * skill/location/type/minPrize filters.
 *
 * Autor: Stevan Gnjato (2023/0141)
 */
import { z } from "zod";

/** Hackathon types, mirroring the `hackathon_type` enum on `hackathons.type`. */
export const HACKATHON_TYPES = ["physical", "virtual", "hybrid"] as const;

/**
 * Normalises a query parameter that may arrive as a single string, a repeated
 * key (`?skills=a&skills=b`) or a comma-separated list (`?skills=a,b`) into a
 * clean, de-blanked `string[]`.
 */
const stringList = z.union([z.string(), z.array(z.string())]).transform((value) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0),
);

/**
 * Query for `GET /search`. Everything is optional: a request can be driven by
 * the text query `q`, by filters alone (e.g. just a location), or both. Each
 * filter narrows only the entities it sensibly applies to.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  /** Skill names or skill UUIDs; narrows users (and hackathons that require them). */
  skills: stringList.optional(),
  /** Case-insensitive substring match on `hackathons.location`. */
  location: z.string().trim().min(1).optional(),
  /** Exact match on `hackathons.type`. */
  type: z.enum(HACKATHON_TYPES).optional(),
  /** Minimum numeric value parsed out of `hackathon_prizes.award_value`. */
  minPrize: z.coerce.number().nonnegative().optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
