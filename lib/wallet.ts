import { db } from "@/db";
import { wallets, walletLedger, type WalletLedgerEntry } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export { formatCentsAsMt } from "@/lib/format";

export async function getWalletBalance(userId: string) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return {
    availableCents: wallet?.availableCents ?? 0,
    lockedCents: wallet?.lockedCents ?? 0,
  };
}

const LEDGER_TYPE_LABELS: Record<string, string> = {
  deposit: "Depósito",
  hold: "Bloqueio (aposta)",
  release: "Reembolso",
  settle_win: "Aposta ganha",
  settle_loss: "Aposta perdida",
};

export async function getWalletLedger(userId: string, limit = 20): Promise<WalletLedgerEntry[]> {
  return db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.userId, userId))
    .orderBy(desc(walletLedger.createdAt))
    .limit(limit);
}

/**
 * The amount to display for most ledger rows is the delta to the
 * AVAILABLE bucket, not availableDelta + lockedDelta — a hold/release
 * moves money between buckets without changing the user's total, so
 * summing the two deltas always nets to zero and would show "0,00 MT"
 * for every hold and release.
 *
 * settle_loss is the one type where available-delta is also misleading
 * in the other direction: a lost stake never touches the available
 * bucket at all (it's removed straight from locked), so availableDelta
 * is 0 even though the user's total balance really did drop by the
 * stake. Show lockedDelta there instead — it's the only field that
 * reflects the actual loss.
 */
export function describeLedgerEntry(entry: WalletLedgerEntry) {
  const label = LEDGER_TYPE_LABELS[entry.type] ?? entry.type;
  const netCents = entry.type === "settle_loss" ? entry.lockedDeltaCents : entry.availableDeltaCents;
  return { label, netCents };
}
