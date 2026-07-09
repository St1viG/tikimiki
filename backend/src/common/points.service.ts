import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { members, pointTransactions } from "../db/schema";

/** A Drizzle transaction handle (the argument passed to `db.transaction`). */
export type DrizzleTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

/** Allowed `point_transactions.type` values. */
export type PointTxnType = (typeof pointTransactions.$inferInsert)["type"];

export interface PointsLedgerMeta {
  type: PointTxnType;
  referenceId?: string | null;
  note?: string | null;
}

export interface PointsMutationResult {
  /** The member's balance after applying the delta. */
  newBalance: number;
}

/**
 * PointsService — the single chokepoint for mutating a member's point balance.
 *
 * Every change reads the current `members.points`, applies the delta, writes
 * the new balance, and appends one append-only `point_transactions` ledger row
 * — all on the caller-supplied transaction handle so the mutation and the
 * ledger entry commit atomically. `debit` additionally enforces a non-negative
 * resulting balance (mirrors the DB `chk_members_points_non_negative` check).
 */
@Injectable()
export class PointsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** Add `delta` (> 0) points and write the ledger row. */
  async credit(
    tx: DrizzleTx,
    userId: string,
    delta: number,
    meta: PointsLedgerMeta,
  ): Promise<PointsMutationResult> {
    return this.apply(tx, userId, Math.abs(delta), meta);
  }

  /**
   * Subtract `amount` (> 0) points and write the ledger row. Throws
   * BadRequestException("insufficient points") if the member cannot afford it.
   */
  async debit(
    tx: DrizzleTx,
    userId: string,
    amount: number,
    meta: PointsLedgerMeta,
  ): Promise<PointsMutationResult> {
    return this.apply(tx, userId, -Math.abs(amount), meta);
  }

  private async apply(
    tx: DrizzleTx,
    userId: string,
    delta: number,
    meta: PointsLedgerMeta,
  ): Promise<PointsMutationResult> {
    const [member] = await tx
      .select({ points: members.points })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);

    if (!member) {
      throw new NotFoundException("Member not found");
    }

    const newBalance = member.points + delta;
    if (newBalance < 0) {
      throw new BadRequestException("insufficient points");
    }

    await tx.update(members).set({ points: newBalance }).where(eq(members.userId, userId));

    await tx.insert(pointTransactions).values({
      userId,
      type: meta.type,
      delta,
      balanceAfter: newBalance,
      referenceId: meta.referenceId ?? null,
      note: meta.note ?? null,
    });

    return { newBalance };
  }
}
