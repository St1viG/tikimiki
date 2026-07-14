import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  cosmeticRarity,
  cosmeticType,
  merchOrderStatus,
  subscriptionPlan,
  subscriptionStatus,
} from "./_enums";
import { members } from "./identity";

const tz = { withTimezone: true } as const;

/* ── cosmetic_items ───────────────────────────────────────── */
export const cosmeticItems = pgTable(
  "cosmetic_items",
  {
    cosmeticId: uuid("cosmetic_id").primaryKey().defaultRandom(),
    type: cosmeticType("type").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    rarity: cosmeticRarity("rarity").notNull().default("common"),
    renderData: jsonb("render_data").notNull(),
    pointCost: integer("point_cost"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_cosmetic_items_name").on(t.name),
    check("chk_cosmetic_point_cost", sql`${t.pointCost} is null or ${t.pointCost} > 0`),
  ],
);

/* ── user_cosmetics ───────────────────────────────────────── */
export const userCosmetics = pgTable(
  "user_cosmetics",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    cosmeticId: uuid("cosmetic_id")
      .notNull()
      .references(() => cosmeticItems.cosmeticId, { onDelete: "cascade" }),
    obtainedAt: timestamp("obtained_at", tz).notNull().defaultNow(),
    source: varchar("source", { length: 50 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cosmeticId] }),
    index("idx_user_cosmetics_cosmetic_id").on(t.cosmeticId),
  ],
);

/* ── user_equipped_cosmetics (composite FK → owned) ───────── */
export const userEquippedCosmetics = pgTable(
  "user_equipped_cosmetics",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    slot: cosmeticType("slot").notNull(),
    cosmeticId: uuid("cosmetic_id")
      .notNull()
      .references(() => cosmeticItems.cosmeticId),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.slot] }),
    // Composite FK to user_cosmetics ensures you can only equip a cosmetic you
    // own; a plain FK to cosmetic_items alone would not enforce ownership.
    foreignKey({
      columns: [t.userId, t.cosmeticId],
      foreignColumns: [userCosmetics.userId, userCosmetics.cosmeticId],
      name: "fk_equipped_must_be_owned",
    }),
    index("idx_user_equipped_cosmetics_cosmetic_id").on(t.cosmeticId),
  ],
);

/* ── merch_items ──────────────────────────────────────────── */
export const merchItems = pgTable(
  "merch_items",
  {
    merchId: uuid("merch_id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    pointCost: integer("point_cost").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_merch_items_name").on(t.name),
    check("chk_merch_point_cost", sql`${t.pointCost} > 0`),
  ],
);

/* ── merch_variants ───────────────────────────────────────── */
export const merchVariants = pgTable(
  "merch_variants",
  {
    variantId: uuid("variant_id").primaryKey().defaultRandom(),
    merchId: uuid("merch_id")
      .notNull()
      .references(() => merchItems.merchId, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(),
    stock: integer("stock").notNull().default(0),
  },
  (t) => [
    uniqueIndex("uq_merch_variants_per_item").on(t.merchId, t.label),
    check("chk_merch_variant_stock", sql`${t.stock} >= 0`),
    index("idx_merch_variants_merch_id").on(t.merchId),
  ],
);

/* ── merch_orders ─────────────────────────────────────────── */
export const merchOrders = pgTable(
  "merch_orders",
  {
    orderId: uuid("order_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "restrict" }),
    pointsSpent: integer("points_spent").notNull(),
    status: merchOrderStatus("status").notNull().default("pending"),
    shippingName: varchar("shipping_name", { length: 200 }).notNull(),
    shippingAddress: text("shipping_address").notNull(),
    shippingCity: varchar("shipping_city", { length: 100 }).notNull(),
    // ISO 3166-1 alpha-2 country code (e.g. "RS", "DE") — char(2) enforces length at the DB level.
    shippingCountry: char("shipping_country", { length: 2 }).notNull(),
    shippingZip: varchar("shipping_zip", { length: 20 }).notNull(),
    trackingNumber: varchar("tracking_number", { length: 100 }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    check("chk_merch_orders_points", sql`${t.pointsSpent} > 0`),
    index("idx_merch_orders_user_id").on(t.userId),
    index("idx_merch_orders_status").on(t.status),
  ],
);

/* ── merch_order_items ────────────────────────────────────── */
export const merchOrderItems = pgTable(
  "merch_order_items",
  {
    orderItemId: uuid("order_item_id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => merchOrders.orderId, { onDelete: "cascade" }),
    merchId: uuid("merch_id")
      .notNull()
      .references(() => merchItems.merchId),
    variantId: uuid("variant_id").references(() => merchVariants.variantId),
    quantity: smallint("quantity").notNull().default(1),
    pointCost: integer("point_cost").notNull(),
  },
  (t) => [
    check("chk_merch_order_items_quantity", sql`${t.quantity} > 0`),
    check("chk_merch_order_items_point_cost", sql`${t.pointCost} > 0`),
    index("idx_merch_order_items_order_id").on(t.orderId),
  ],
);

/* ── subscriptions ────────────────────────────────────────── */
export const subscriptions = pgTable(
  "subscriptions",
  {
    subscriptionId: uuid("subscription_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => members.userId, { onDelete: "cascade" }),
    plan: subscriptionPlan("plan").notNull().default("premium"),
    status: subscriptionStatus("status").notNull().default("active"),
    startedAt: timestamp("started_at", tz).notNull().defaultNow(),
    endsAt: timestamp("ends_at", tz).notNull(),
    cancelledAt: timestamp("cancelled_at", tz),
  },
  (t) => [
    check("chk_subscriptions_dates", sql`${t.startedAt} < ${t.endsAt}`),
    check(
      "chk_subscriptions_cancelled_consistency",
      sql`${t.cancelledAt} is null or ${t.status} = 'cancelled'`,
    ),
    index("idx_subscriptions_user_id").on(t.userId),
    index("idx_subscriptions_active")
      .on(t.userId, t.status)
      .where(sql`${t.status} = 'active'`),
  ],
);

/* ── subscription_payments ────────────────────────────────── */
export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    paymentId: uuid("payment_id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.subscriptionId),
    amountCents: integer("amount_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    paymentProvider: varchar("payment_provider", { length: 50 }).notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    paidAt: timestamp("paid_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_subscription_payments_provider_id").on(t.paymentProvider, t.providerPaymentId),
    check("chk_subscription_payments_amount", sql`${t.amountCents} > 0`),
    index("idx_subscription_payments_subscription_id").on(t.subscriptionId),
  ],
);
