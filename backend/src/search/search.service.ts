/**
 * Cross-entity search over users, organizations and hackathons, with optional
 * skill/location/type/minPrize filters applied only to the entities they fit.
 *
 * Autor: Stevan Gnjato (2023/0141)
 */
import { Inject, Injectable } from "@nestjs/common";
import { type SQL, and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  hackathonPrizes,
  hackathonRequiredSkills,
  hackathons,
  memberSkills,
  organizations,
  skills,
  users,
} from "../db/schema";
import type { SearchQuery } from "./dto";

const RESULT_LIMIT = 10;
const SUBTITLE_MAX_LENGTH = 140;

/** Matches a canonical UUID, used to tell skill IDs apart from skill names. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One matched entity, shaped uniformly regardless of its underlying table. */
export interface SearchResultItem {
  id: string;
  label: string;
  subtitle?: string;
  imageUrl?: string;
}

export interface SearchResult {
  users: SearchResultItem[];
  organizations: SearchResultItem[];
  hackathons: SearchResultItem[];
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Runs the three per-entity queries in parallel and applies any provided
   * filters. Filters are additive (AND) and scoped: `skills` narrows users and
   * hackathons, while `location`/`type`/`minPrize` narrow only hackathons. With
   * no filters the result is identical to a plain `q`-only search.
   */
  async search(query: SearchQuery): Promise<SearchResult> {
    const q = query.q;
    const term = q ? `%${q}%` : undefined;

    // Resolve skill names/IDs to concrete skillIds once; `undefined` means the
    // skills filter was not supplied at all (so it is skipped entirely).
    const skillIds = query.skills?.length ? await this.resolveSkillIds(query.skills) : undefined;

    // An entity is included only when something constrains it, so a filter-only
    // request (e.g. a location with no text query) returns just the entities that
    // filter applies to — not every row, and not an empty page. Inactive entities
    // get a `false` guard so their query returns nothing.
    const usersActive = Boolean(q) || skillIds !== undefined;
    const hackathonsActive =
      Boolean(q) ||
      Boolean(query.location) ||
      Boolean(query.type) ||
      query.minPrize !== undefined ||
      skillIds !== undefined;

    const userConditions: (SQL | undefined)[] = [isNull(users.deletedAt)];
    if (term) {
      userConditions.push(or(ilike(users.username, term), ilike(users.displayName, term)));
    }
    if (skillIds) {
      userConditions.push(
        skillIds.length
          ? inArray(
              users.userId,
              this.db
                .select({ userId: memberSkills.userId })
                .from(memberSkills)
                .where(inArray(memberSkills.skillId, skillIds)),
            )
          : sql`false`,
      );
    }
    if (!usersActive) userConditions.push(sql`false`);

    const hackathonConditions: (SQL | undefined)[] = [isNull(hackathons.deletedAt)];
    if (term) {
      hackathonConditions.push(
        or(ilike(hackathons.title, term), ilike(hackathons.description, term)),
      );
    }
    if (query.location) {
      hackathonConditions.push(ilike(hackathons.location, `%${query.location}%`));
    }
    if (query.type) {
      hackathonConditions.push(eq(hackathons.type, query.type));
    }
    if (skillIds) {
      hackathonConditions.push(
        skillIds.length
          ? inArray(
              hackathons.hackathonId,
              this.db
                .select({ hackathonId: hackathonRequiredSkills.hackathonId })
                .from(hackathonRequiredSkills)
                .where(inArray(hackathonRequiredSkills.skillId, skillIds)),
            )
          : sql`false`,
      );
    }
    if (query.minPrize !== undefined) {
      // `award_value` is free text (e.g. "$5,000", "MacBook"); strip non-digits
      // and compare numerically. Non-numeric awards drop out (become NULL).
      hackathonConditions.push(
        inArray(
          hackathons.hackathonId,
          this.db
            .select({ hackathonId: hackathonPrizes.hackathonId })
            .from(hackathonPrizes)
            .where(
              sql`nullif(regexp_replace(coalesce(${hackathonPrizes.awardValue}, ''), '[^0-9]', '', 'g'), '')::numeric >= ${query.minPrize}`,
            ),
        ),
      );
    }
    if (!hackathonsActive) hackathonConditions.push(sql`false`);

    // Organizations only ever match on their name, so they surface only when a
    // text query is present.
    const organizationCondition = term ? ilike(organizations.name, term) : sql`false`;

    const [userRows, organizationRows, hackathonRows] = await Promise.all([
      this.db
        .select({
          id: users.userId,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(and(...userConditions))
        .limit(RESULT_LIMIT),
      this.db
        .select({
          id: organizations.userId,
          name: organizations.name,
          logoUrl: organizations.logoUrl,
        })
        .from(organizations)
        .where(organizationCondition)
        .limit(RESULT_LIMIT),
      this.db
        .select({
          id: hackathons.hackathonId,
          title: hackathons.title,
          description: hackathons.description,
          logoUrl: hackathons.logoUrl,
        })
        .from(hackathons)
        .where(and(...hackathonConditions))
        .limit(RESULT_LIMIT),
    ]);

    return {
      users: userRows.map((r) => ({
        id: r.id,
        label: r.username,
        subtitle: r.displayName ?? undefined,
        imageUrl: r.avatarUrl ?? undefined,
      })),
      organizations: organizationRows.map((r) => ({
        id: r.id,
        label: r.name,
        imageUrl: r.logoUrl ?? undefined,
      })),
      hackathons: hackathonRows.map((r) => ({
        id: r.id,
        label: r.title,
        subtitle: truncate(r.description, SUBTITLE_MAX_LENGTH),
        imageUrl: r.logoUrl ?? undefined,
      })),
    };
  }

  /**
   * Turns a mix of skill names and skill UUIDs into concrete skillIds. Names
   * match case-insensitively; unknown names/IDs simply resolve to nothing.
   */
  private async resolveSkillIds(idsOrNames: string[]): Promise<string[]> {
    const ids = idsOrNames.filter((v) => UUID_RE.test(v));
    const names = idsOrNames.filter((v) => !UUID_RE.test(v)).map((v) => v.toLowerCase());

    const conditions: SQL[] = [];
    if (ids.length) conditions.push(inArray(skills.skillId, ids));
    if (names.length) conditions.push(inArray(sql`lower(${skills.name})`, names));
    if (conditions.length === 0) return [];

    const rows = await this.db
      .select({ id: skills.skillId })
      .from(skills)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions));
    return rows.map((r) => r.id);
  }
}
