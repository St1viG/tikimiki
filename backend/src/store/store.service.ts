import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { PointsService } from "../common/points.service";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import {
  cosmeticItems,
  merchItems,
  merchOrderItems,
  merchOrders,
  merchVariants,
  userCosmetics,
} from "../db/schema";
import type { CreateMerchOrderInput } from "./dto";

/* ── response shapes ──────────────────────────────────────── */
export interface CosmeticDto {
  cosmeticId: string;
  type: string;
  name: string;
  description: string | null;
  rarity: string;
  pointCost: number | null;
}

export interface MerchVariantDto {
  variantId: string;
  label: string;
  stock: number;
}

export interface MerchDto {
  merchId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pointCost: number;
  isAvailable: boolean;
  variants: MerchVariantDto[];
}

export interface InventoryCosmeticDto {
  cosmeticId: string;
  name: string;
  type: string;
  rarity: string;
  obtainedAt: string;
}

export interface InventoryResponse {
  cosmetics: InventoryCosmeticDto[];
}

export interface BuyCosmeticResponse {
  success: true;
  newBalance: number;
}

export interface CreateMerchOrderResponse {
  orderId: string;
  status: string;
  pointsSpent: number;
  newBalance: number;
}

@Injectable()
export class StoreService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly points: PointsService,
  ) {}

  /* ── GET /store/cosmetics (public) ──────────────────────── */
  async listCosmetics(): Promise<CosmeticDto[]> {
    const rows = await this.db
      .select({
        cosmeticId: cosmeticItems.cosmeticId,
        type: cosmeticItems.type,
        name: cosmeticItems.name,
        description: cosmeticItems.description,
        rarity: cosmeticItems.rarity,
        pointCost: cosmeticItems.pointCost,
      })
      .from(cosmeticItems)
      .orderBy(asc(cosmeticItems.name));

    return rows.map((r) => ({
      cosmeticId: r.cosmeticId,
      type: r.type,
      name: r.name,
      description: r.description,
      rarity: r.rarity,
      pointCost: r.pointCost,
    }));
  }

  /* ── GET /store/merch (public) ──────────────────────────── */
  async listMerch(): Promise<MerchDto[]> {
    const items = await this.db
      .select({
        merchId: merchItems.merchId,
        name: merchItems.name,
        description: merchItems.description,
        imageUrl: merchItems.imageUrl,
        pointCost: merchItems.pointCost,
        isAvailable: merchItems.isAvailable,
      })
      .from(merchItems)
      .orderBy(asc(merchItems.name));

    if (items.length === 0) return [];

    const variants = await this.db
      .select({
        variantId: merchVariants.variantId,
        merchId: merchVariants.merchId,
        label: merchVariants.label,
        stock: merchVariants.stock,
      })
      .from(merchVariants)
      .orderBy(asc(merchVariants.label));

    const byMerch = new Map<string, MerchVariantDto[]>();
    for (const v of variants) {
      const list = byMerch.get(v.merchId) ?? [];
      list.push({ variantId: v.variantId, label: v.label, stock: v.stock });
      byMerch.set(v.merchId, list);
    }

    return items.map((m) => ({
      merchId: m.merchId,
      name: m.name,
      description: m.description,
      imageUrl: m.imageUrl,
      pointCost: m.pointCost,
      isAvailable: m.isAvailable,
      variants: byMerch.get(m.merchId) ?? [],
    }));
  }

  /* ── GET /store/me/inventory (auth) ─────────────────────── */
  async getInventory(userId: string): Promise<InventoryResponse> {
    const rows = await this.db
      .select({
        cosmeticId: userCosmetics.cosmeticId,
        name: cosmeticItems.name,
        type: cosmeticItems.type,
        rarity: cosmeticItems.rarity,
        obtainedAt: userCosmetics.obtainedAt,
      })
      .from(userCosmetics)
      .innerJoin(cosmeticItems, eq(userCosmetics.cosmeticId, cosmeticItems.cosmeticId))
      .where(eq(userCosmetics.userId, userId))
      .orderBy(asc(cosmeticItems.name));

    return {
      cosmetics: rows.map((r) => ({
        cosmeticId: r.cosmeticId,
        name: r.name,
        type: r.type,
        rarity: r.rarity,
        obtainedAt: r.obtainedAt.toISOString(),
      })),
    };
  }

  /* ── POST /store/cosmetics/:cosmeticId/buy (auth) ───────── */
  async buyCosmetic(userId: string, cosmeticId: string): Promise<BuyCosmeticResponse> {
    return this.db.transaction(async (tx) => {
      const [cosmetic] = await tx
        .select({
          cosmeticId: cosmeticItems.cosmeticId,
          pointCost: cosmeticItems.pointCost,
        })
        .from(cosmeticItems)
        .where(eq(cosmeticItems.cosmeticId, cosmeticId))
        .limit(1);

      if (!cosmetic) {
        throw new NotFoundException("Cosmetic not found");
      }

      const [existing] = await tx
        .select({ cosmeticId: userCosmetics.cosmeticId })
        .from(userCosmetics)
        .where(and(eq(userCosmetics.userId, userId), eq(userCosmetics.cosmeticId, cosmeticId)))
        .limit(1);

      if (existing) {
        throw new ConflictException("Cosmetic already owned");
      }

      if (cosmetic.pointCost === null) {
        throw new BadRequestException("Cosmetic is not purchasable");
      }
      const cost = cosmetic.pointCost;

      await tx.insert(userCosmetics).values({
        userId,
        cosmeticId,
        source: "store",
      });

      const { newBalance } = await this.points.debit(tx, userId, cost, {
        type: "merch_purchase",
        referenceId: cosmeticId,
        note: "Cosmetic purchase",
      });

      return { success: true as const, newBalance };
    });
  }

  /* ── POST /store/merch/:merchId/order (auth) ────────────── */
  async createMerchOrder(
    userId: string,
    merchId: string,
    body: CreateMerchOrderInput,
  ): Promise<CreateMerchOrderResponse> {
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .select({
          merchId: merchItems.merchId,
          pointCost: merchItems.pointCost,
          isAvailable: merchItems.isAvailable,
        })
        .from(merchItems)
        .where(eq(merchItems.merchId, merchId))
        .limit(1);

      if (!item) {
        throw new NotFoundException("Merch item not found");
      }

      if (!item.isAvailable) {
        throw new BadRequestException("Merch item is unavailable");
      }

      // Validate variant (if supplied) belongs to this item and is in stock.
      if (body.variantId !== undefined) {
        const [variant] = await tx
          .select({
            variantId: merchVariants.variantId,
            stock: merchVariants.stock,
          })
          .from(merchVariants)
          .where(
            and(eq(merchVariants.variantId, body.variantId), eq(merchVariants.merchId, merchId)),
          )
          .limit(1);

        if (!variant) {
          throw new BadRequestException("Invalid variant for this item");
        }
        if (variant.stock <= 0) {
          throw new BadRequestException("Selected variant is out of stock");
        }
      }

      const cost = item.pointCost;

      const [order] = await tx
        .insert(merchOrders)
        .values({
          userId,
          pointsSpent: cost,
          shippingName: body.shippingName,
          shippingAddress: body.shippingAddress,
          shippingCity: body.shippingCity,
          shippingCountry: body.shippingCountry,
          shippingZip: body.shippingZip,
        })
        .returning({
          orderId: merchOrders.orderId,
          status: merchOrders.status,
          pointsSpent: merchOrders.pointsSpent,
        });

      await tx.insert(merchOrderItems).values({
        orderId: order.orderId,
        merchId,
        variantId: body.variantId ?? null,
        quantity: 1,
        pointCost: cost,
      });

      // Decrement variant stock when a variant was selected.
      if (body.variantId !== undefined) {
        await tx
          .update(merchVariants)
          .set({ stock: sql`${merchVariants.stock} - 1` })
          .where(eq(merchVariants.variantId, body.variantId));
      }

      const { newBalance } = await this.points.debit(tx, userId, cost, {
        type: "merch_purchase",
        referenceId: order.orderId,
        note: "Merch order",
      });

      return {
        orderId: order.orderId,
        status: order.status,
        pointsSpent: order.pointsSpent,
        newBalance,
      };
    });
  }
}
