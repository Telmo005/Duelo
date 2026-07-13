import { db } from "@/db";
import { withdrawals, profiles, type Withdrawal } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/** A user's own withdrawal requests, newest first — the "Minhas Apostas"
 *  equivalent for the wallet's withdraw flow. */
export async function getUserWithdrawals(userId: string, limit = 20): Promise<Withdrawal[]> {
  return db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, userId))
    .orderBy(desc(withdrawals.createdAt))
    .limit(limit);
}

export type PendingWithdrawalRow = Withdrawal & {
  /** The requester's own registered identity, shown next to the requested
   *  payout phone/name so an admin can spot a mismatch before sending real
   *  money — see the fraud-review note in the 0017 migration. */
  requesterPhone: string | null;
  requesterDisplayName: string;
};

/** The admin worklist — every 'pending' withdrawal, oldest first (first
 *  requested, first processed). Unbounded is fine here: pending requests
 *  are cleared by an admin action, not accumulated by user activity, so
 *  this can't grow the way e.g. a full history table would. */
export async function getPendingWithdrawals(): Promise<PendingWithdrawalRow[]> {
  const rows = await db
    .select({ withdrawal: withdrawals, requesterPhone: profiles.phone, requesterDisplayName: profiles.displayName })
    .from(withdrawals)
    .innerJoin(profiles, eq(profiles.id, withdrawals.userId))
    .where(eq(withdrawals.status, "pending"))
    .orderBy(withdrawals.createdAt);

  return rows.map((r) => ({ ...r.withdrawal, requesterPhone: r.requesterPhone, requesterDisplayName: r.requesterDisplayName }));
}
