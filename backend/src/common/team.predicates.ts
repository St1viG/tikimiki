import { and, isNull } from "drizzle-orm";
import { teamMembers } from "../db/schema";

/**
 * SQL predicate for an **active** team membership row: the member has neither
 * left the team (`leftAt is null`) nor been soft-deleted (`deletedAt is null`).
 *
 * Combine with the rest of your `where(and(...))` conditions, e.g.
 * `and(eq(teamMembers.teamId, teamId), activeTeamMember)`.
 */
export const activeTeamMember = and(isNull(teamMembers.leftAt), isNull(teamMembers.deletedAt));
