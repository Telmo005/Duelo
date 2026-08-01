import { db } from "@/db";
import { wallets, walletLedger, platformLedger, bets, profiles, matches, deposits, affiliateLedger, platformSettings } from "@/db/schema";
import { eq, desc, sql, isNotNull, inArray } from "drizzle-orm";

export async function getFinancialSummary() {
  const [walletTotals] = await db
    .select({
      totalAvailable: sql<number>`coalesce(sum(${wallets.availableCents}), 0)`,
      totalLocked: sql<number>`coalesce(sum(${wallets.lockedCents}), 0)`,
      walletCount: sql<number>`count(*)`,
    })
    .from(wallets);

  const [depositTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${walletLedger.availableDeltaCents}), 0)` })
    .from(walletLedger)
    .where(eq(walletLedger.type, "deposit"));

  const [commissionTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${platformLedger.amountCents}), 0)` })
    .from(platformLedger);

  const [affiliateTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${affiliateLedger.payoutCents}), 0)` })
    .from(affiliateLedger);

  const [betCounts] = await db
    .select({
      waiting: sql<number>`count(*) filter (where ${bets.status} = 'waiting')`,
      matched: sql<number>`count(*) filter (where ${bets.status} = 'matched')`,
      settled: sql<number>`count(*) filter (where ${bets.status} = 'settled')`,
    })
    .from(bets);

  return {
    totalAvailableCents: Number(walletTotals?.totalAvailable ?? 0),
    totalLockedCents: Number(walletTotals?.totalLocked ?? 0),
    walletCount: Number(walletTotals?.walletCount ?? 0),
    totalDepositsCents: Number(depositTotals?.total ?? 0),
    totalCommissionCents: Number(commissionTotals?.total ?? 0),
    totalAffiliatePayoutsCents: Number(affiliateTotals?.total ?? 0),
    betsWaiting: Number(betCounts?.waiting ?? 0),
    betsMatched: Number(betCounts?.matched ?? 0),
    betsSettled: Number(betCounts?.settled ?? 0),
  };
}

export async function getFlaggedBets(limit = 50) {
  const rows = await db
    .select({
      bet: bets,
      matchHome: matches.home,
      matchAway: matches.away,
    })
    .from(bets)
    .innerJoin(matches, eq(matches.id, bets.matchId))
    .where(isNotNull(bets.flaggedReason))
    .orderBy(desc(bets.flaggedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.flatMap((r) => [r.bet.creatorId, r.bet.opponentId].filter((x): x is string => !!x)))];
  const profileRows = await db.select().from(profiles).where(sql`${profiles.id} in ${userIds}`);
  const profileById = new Map(profileRows.map((p) => [p.id, p]));

  return rows.map((r) => ({
    ...r.bet,
    matchHome: r.matchHome,
    matchAway: r.matchAway,
    creatorName: profileById.get(r.bet.creatorId)?.displayName ?? "?",
    opponentName: r.bet.opponentId ? profileById.get(r.bet.opponentId)?.displayName ?? "?" : null,
  }));
}

export async function getRecentBets(limit = 30) {
  const rows = await db.select().from(bets).orderBy(desc(bets.createdAt)).limit(limit);
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.flatMap((r) => [r.creatorId, r.opponentId].filter((x): x is string => !!x)))];
  const profileRows = await db.select().from(profiles).where(sql`${profiles.id} in ${userIds}`);
  const profileById = new Map(profileRows.map((p) => [p.id, p]));

  return rows.map((r) => ({
    ...r,
    creatorName: profileById.get(r.creatorId)?.displayName ?? "?",
    opponentName: r.opponentId ? profileById.get(r.opponentId)?.displayName ?? "?" : null,
  }));
}

/** Deposits stuck in a non-final state — the same "pending or failed"
 *  window lib/deposit-reconcile.ts polls PayGate for. Surfaced here so an
 *  admin can see what a reconciliation pass would look at before running
 *  it, and what's still stuck afterward. */
export async function getStuckDeposits(limit = 30) {
  const rows = await db
    .select({ deposit: deposits, displayName: profiles.displayName })
    .from(deposits)
    .innerJoin(profiles, eq(profiles.id, deposits.userId))
    .where(inArray(deposits.status, ["pending", "failed"]))
    .orderBy(desc(deposits.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r.deposit, displayName: r.displayName }));
}

export async function getWalletOverview(limit = 30) {
  const rows = await db
    .select({ profile: profiles, wallet: wallets })
    .from(wallets)
    .innerJoin(profiles, eq(profiles.id, wallets.userId))
    .orderBy(desc(wallets.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    displayName: r.profile.displayName,
    email: r.profile.email,
    availableCents: r.wallet.availableCents,
    lockedCents: r.wallet.lockedCents,
  }));
}

/** The two admin-configurable rates bet_settle_match reads at settlement
 *  time (migration 0038_affiliate_program.sql). Falls back to the same
 *  defaults as the platform_settings table itself if the singleton row is
 *  somehow missing — it's seeded by the migration, so this is defensive
 *  only. */
export async function getPlatformSettings() {
  const [row] = await db.select().from(platformSettings).limit(1);
  return {
    commissionRateBps: row?.commissionRateBps ?? 1000,
    referralShareBps: row?.referralShareBps ?? 3000,
  };
}

/** One row per user who has ever earned an affiliate payout — name,
 *  phone, code, how many people they referred, total earned via
 *  affiliate_ledger, and their current wallet balance side by side. This
 *  is the "saldo dos usuários + saldo que acumulam via links" view. */
export async function getAffiliateOverview() {
  const rows = await db
    .select({
      referrerId: affiliateLedger.referrerId,
      totalEarnedCents: sql<number>`coalesce(sum(${affiliateLedger.payoutCents}), 0)`,
      referredCount: sql<number>`count(distinct ${affiliateLedger.referredUserId})`,
    })
    .from(affiliateLedger)
    .groupBy(affiliateLedger.referrerId);

  if (rows.length === 0) return [];

  const referrerIds = rows.map((r) => r.referrerId);
  const profileRows = await db
    .select({ profile: profiles, wallet: wallets })
    .from(profiles)
    .innerJoin(wallets, eq(wallets.userId, profiles.id))
    .where(inArray(profiles.id, referrerIds));
  const byId = new Map(profileRows.map((r) => [r.profile.id, r]));

  return rows
    .map((r) => {
      const match = byId.get(r.referrerId);
      if (!match) return null;
      return {
        userId: r.referrerId,
        displayName: match.profile.displayName,
        phone: match.profile.phone,
        referralCode: match.profile.referralCode,
        referredCount: Number(r.referredCount),
        totalEarnedCents: Number(r.totalEarnedCents),
        availableCents: match.wallet.availableCents,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.totalEarnedCents - a.totalEarnedCents);
}
