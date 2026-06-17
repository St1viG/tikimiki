import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
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

  private toView(row: {
    subscriptionId: string;
    plan: "premium";
    status: "active" | "cancelled" | "expired";
    startedAt: Date;
    endsAt: Date;
    cancelledAt: Date | null;
  }): SubscriptionView {
    return {
      subscriptionId: row.subscriptionId,
      plan: row.plan,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
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
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
        ),
      )
      .orderBy(desc(subscriptions.startedAt))
      .limit(1);

    return { subscription: row ? this.toView(row) : null };
  }

  /** Create an active subscription for the caller (mock payment). */
  async activate(
    userId: string,
    input: ActivateSubscriptionInput,
  ): Promise<SubscriptionView> {
    const [existing] = await this.db
      .select({ subscriptionId: subscriptions.subscriptionId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException("An active subscription already exists");
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
      });

    return this.toView(row);
  }

  /** Cancel the caller's active subscription. */
  async cancel(userId: string): Promise<CancelSubscriptionResponse> {
    const now = new Date();
    const updated = await this.db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now })
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
        ),
      )
      .returning({ subscriptionId: subscriptions.subscriptionId });

    if (updated.length === 0) {
      throw new NotFoundException("No active subscription to cancel");
    }

    return { success: true };
  }
}
