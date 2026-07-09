import { Inject, Injectable } from "@nestjs/common";
import { and, ilike, isNull, or } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { hackathons, organizations, users } from "../db/schema";
import type { SearchQuery } from "./dto";

const RESULT_LIMIT = 10;
const SUBTITLE_MAX_LENGTH = 140;

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

  async search(query: SearchQuery): Promise<SearchResult> {
    const term = `%${query.q}%`;

    const [userRows, organizationRows, hackathonRows] = await Promise.all([
      this.db
        .select({
          id: users.userId,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(
          and(
            isNull(users.deletedAt),
            or(ilike(users.username, term), ilike(users.displayName, term)),
          ),
        )
        .limit(RESULT_LIMIT),
      this.db
        .select({
          id: organizations.userId,
          name: organizations.name,
          logoUrl: organizations.logoUrl,
        })
        .from(organizations)
        .where(ilike(organizations.name, term))
        .limit(RESULT_LIMIT),
      this.db
        .select({
          id: hackathons.hackathonId,
          title: hackathons.title,
          description: hackathons.description,
          logoUrl: hackathons.logoUrl,
        })
        .from(hackathons)
        .where(
          and(
            isNull(hackathons.deletedAt),
            or(
              ilike(hackathons.title, term),
              ilike(hackathons.description, term),
            ),
          ),
        )
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
}
