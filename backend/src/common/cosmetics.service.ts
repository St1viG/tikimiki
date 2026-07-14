import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { cosmeticItems, userEquippedCosmetics } from "../db/schema";

/** One equipped cosmetic, shaped for rendering on the client. */
export interface EquippedCosmeticDto {
  cosmeticId: string;
  name: string;
  /** Free-form render hints from cosmetic_items.render_data (e.g. { glow: "#A78BFA" }). */
  renderData: Record<string, unknown>;
}

/** The cosmetics a user currently has equipped, keyed by surface. */
export interface EquippedCosmeticsDto {
  usernameEffect: EquippedCosmeticDto | null;
  profileDecoration: EquippedCosmeticDto | null;
}

export const NO_EQUIPPED_COSMETICS: EquippedCosmeticsDto = {
  usernameEffect: null,
  profileDecoration: null,
};

/**
 * Shared lookup of equipped cosmetics (user_equipped_cosmetics ⋈ cosmetic_items).
 * Slots map to render surfaces: `username_effect` → the displayed name,
 * `avatar_decoration` / `banner_effect` → the profile decoration (banner frame).
 */
@Injectable()
export class CosmeticsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Equipped cosmetics for a batch of users; users without any are omitted. */
  async equippedForUsers(userIds: string[]): Promise<Map<string, EquippedCosmeticsDto>> {
    const map = new Map<string, EquippedCosmeticsDto>();
    if (userIds.length === 0) return map;

    const rows = await this.db
      .select({
        userId: userEquippedCosmetics.userId,
        slot: userEquippedCosmetics.slot,
        cosmeticId: cosmeticItems.cosmeticId,
        name: cosmeticItems.name,
        renderData: cosmeticItems.renderData,
      })
      .from(userEquippedCosmetics)
      .innerJoin(cosmeticItems, eq(cosmeticItems.cosmeticId, userEquippedCosmetics.cosmeticId))
      .where(inArray(userEquippedCosmetics.userId, userIds));

    for (const r of rows) {
      const entry = map.get(r.userId) ?? { usernameEffect: null, profileDecoration: null };
      const dto: EquippedCosmeticDto = {
        cosmeticId: r.cosmeticId,
        name: r.name,
        renderData: (r.renderData ?? {}) as Record<string, unknown>,
      };
      if (r.slot === "username_effect") {
        entry.usernameEffect = dto;
      } else if (r.slot === "avatar_decoration" || entry.profileDecoration === null) {
        // avatar_decoration wins over a legacy banner_effect when both exist;
        // the first non-avatar_decoration row only fills the slot if it's still empty.
        entry.profileDecoration = dto;
      }
      map.set(r.userId, entry);
    }
    return map;
  }

  /** Equipped cosmetics for a single user. */
  async equippedForUser(userId: string): Promise<EquippedCosmeticsDto> {
    const map = await this.equippedForUsers([userId]);
    return map.get(userId) ?? NO_EQUIPPED_COSMETICS;
  }
}
