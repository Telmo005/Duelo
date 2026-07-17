import { db } from "@/db";
import { wallets, walletLedger, type WalletLedgerEntry } from "@/db/schema";
import { eq, desc, and, or, lt } from "drizzle-orm";

export { formatCentsAsMt } from "@/lib/format";
// Re-exported for existing server-side callers — the real definition lives
// in lib/ledger-format.ts (a pure, client-safe module with no `db` import),
// since anything importing from THIS file drags the Node-only postgres
// client into the bundle of whoever imports it, which breaks the moment a
// client component needs it (see components/wallet/wallet-ledger-list.tsx).
export { describeLedgerEntry } from "@/lib/ledger-format";

export async function getWalletBalance(userId: string) {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return {
    availableCents: wallet?.availableCents ?? 0,
    lockedCents: wallet?.lockedCents ?? 0,
  };
}

export type WalletLedgerPage = { items: WalletLedgerEntry[]; nextCursor: string | null };

/** Opaque cursor = base64url("<createdAt ISO>|<id>") — (createdAt, id) as a
 *  composite key so pagination stays stable even if two rows land in the
 *  same millisecond (createdAt alone isn't guaranteed unique). */
function encodeLedgerCursor(entry: WalletLedgerEntry): string {
  return Buffer.from(`${entry.createdAt.toISOString()}|${entry.id}`).toString("base64url");
}
function decodeLedgerCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  return { createdAt: new Date(iso), id };
}

/** Cursor-paginated — was a flat `.limit(20)` with no way to see anything
 *  older, which for an active bettor meant transactions just fell off the
 *  end permanently. Fetches one extra row past `limit` purely to know
 *  whether a next page exists, without a separate COUNT query. */
export async function getWalletLedger(userId: string, opts: { cursor?: string; limit?: number } = {}): Promise<WalletLedgerPage> {
  const limit = opts.limit ?? 20;
  const conditions = [eq(walletLedger.userId, userId)];

  if (opts.cursor) {
    const { createdAt, id } = decodeLedgerCursor(opts.cursor);
    conditions.push(
      or(lt(walletLedger.createdAt, createdAt), and(eq(walletLedger.createdAt, createdAt), lt(walletLedger.id, id))!)!
    );
  }

  const rows = await db
    .select()
    .from(walletLedger)
    .where(and(...conditions))
    .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeLedgerCursor(items[items.length - 1]) : null };
}
