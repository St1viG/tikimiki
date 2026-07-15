import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { DAY_MS } from "../common/constants";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { subscriptions } from "../db/schema";
import type { ActivateSubscriptionInput } from "./dto";

/* ── response types ───────────────────────────────────────── */

export interface SubscriptionPlan {
  id: "premium";
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
}

export interface PlansResponse {
  plans: SubscriptionPlan[];
}

export interface SubscriptionView {
  subscriptionId: string;
  plan: "premium";
  status: "active" | "cancelled" | "expired";
  startedAt: string;
  endsAt: string;
  cancelledAt: string | null;
  /** True when the member cancelled: Premium stays until endsAt, then no renewal. */
  cancelAtPeriodEnd: boolean;
}

export interface MySubscriptionResponse {
  subscription: SubscriptionView | null;
}

export interface CancelSubscriptionResponse {
  success: true;
}

/* ── static plan catalogue ────────────────────────────────── */

const PLANS: SubscriptionPlan[] = [
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: 4.99,
    annualPrice: 49.99,
    features: [
      "Bez reklama / Ad-free experience",
      "Ekskluzivne Premium značke i kozmetika / Exclusive Premium badges & cosmetics",
      "Prioritet pri prijavi na hakatone / Priority hackathon registration",
      "Napredna statistika tima / Advanced team analytics",
      "Bonus bodovi svaki dan / Daily bonus points",
      "Prioritetna podrška / Priority support",
    ],
  },
];

@Injectable()
export class SubscriptionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Public static plan catalogue. */
  getPlans(): PlansResponse {
    return { plans: PLANS };
  }

  /**
   * Whether the user currently has Premium — an active subscription that has
   * not yet lapsed. This is the single source of truth for premium-gated
   * features (profile badge, animated GIF avatar).
   */
  async isPremium(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ subscriptionId: subscriptions.subscriptionId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
          gt(subscriptions.endsAt, new Date()),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Batch variant of {@link isPremium}: given a list of user ids, return the
   * subset that currently holds Premium. One query for the whole list — use
   * this when marking members of a server / conversation.
   */
  async premiumUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.userId, userIds),
          eq(subscriptions.status, "active"),
          gt(subscriptions.endsAt, new Date()),
        ),
      );
    return new Set(rows.map((r) => r.userId));
  }

  private toView(row: {
    subscriptionId: string;
    plan: "premium";
    status: "active" | "cancelled" | "expired";
    startedAt: Date;
    endsAt: Date;
    cancelledAt: Date | null;
    cancelAtPeriodEnd: boolean;
  }): SubscriptionView {
    return {
      subscriptionId: row.subscriptionId,
      plan: row.plan,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    };
  }

  /** Caller's most recent active subscription, else null. */
  async getMine(userId: string): Promise<MySubscriptionResponse> {
    const [row] = await this.db
      .select({
        subscriptionId: subscriptions.subscriptionId,
        plan: subscriptions.plan,
        status: subscriptions.status,
        startedAt: subscriptions.startedAt,
        endsAt: subscriptions.endsAt,
        cancelledAt: subscriptions.cancelledAt,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .orderBy(desc(subscriptions.startedAt))
      .limit(1);

    return { subscription: row ? this.toView(row) : null };
  }

  /**
   * Create an active subscription for the caller (mock payment).
   *
   * Re-subscribing while a cancel-at-period-end is pending simply lifts the
   * flag (auto-renew resumes) — the running period is kept, nothing is billed.
   */
  async activate(userId: string, input: ActivateSubscriptionInput): Promise<SubscriptionView> {
    const [existing] = await this.db
      .select({
        subscriptionId: subscriptions.subscriptionId,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .limit(1);

    if (existing) {
      if (!existing.cancelAtPeriodEnd) {
        throw new ConflictException("An active subscription already exists");
      }
      const [reactivated] = await this.db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: false })
        .where(eq(subscriptions.subscriptionId, existing.subscriptionId))
        .returning({
          subscriptionId: subscriptions.subscriptionId,
          plan: subscriptions.plan,
          status: subscriptions.status,
          startedAt: subscriptions.startedAt,
          endsAt: subscriptions.endsAt,
          cancelledAt: subscriptions.cancelledAt,
          cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        });
      return this.toView(reactivated);
    }

    const now = new Date();
    const durationDays = input.billingCycle === "annual" ? 365 : 30;
    const endsAt = new Date(now.getTime() + durationDays * DAY_MS);

    const [row] = await this.db
      .insert(subscriptions)
      .values({
        userId,
        plan: "premium",
        status: "active",
        startedAt: now,
        endsAt,
      })
      .returning({
        subscriptionId: subscriptions.subscriptionId,
        plan: subscriptions.plan,
        status: subscriptions.status,
        startedAt: subscriptions.startedAt,
        endsAt: subscriptions.endsAt,
        cancelledAt: subscriptions.cancelledAt,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      });

    return this.toView(row);
  }

  /**
   * Cancel the caller's active subscription — Premium stays until the end of
   * the paid period. The row is only flagged `cancelAtPeriodEnd`; the expiry
   * scheduler moves it to "cancelled" once `endsAt` passes. Personalization
   * (banner, GIF avatar) is kept in the database for a later reactivation;
   * its display is gated by `isPremium` wherever it is served.
   */
  async cancel(userId: string): Promise<CancelSubscriptionResponse> {
    const updated = await this.db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .returning({ subscriptionId: subscriptions.subscriptionId });

    if (updated.length === 0) {
      throw new NotFoundException("No active subscription to cancel");
    }

    return { success: true };
  }
}
