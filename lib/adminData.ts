import { db } from "@/db";
import { wallets, walletLedger, platformLedger, bets, profiles, matches } from "@/db/schema";
import { eq, desc, sql, isNotNull } from "drizzle-orm";

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
    betsWaiting: Number(betCounts?.waiting ?? 0),
    betsMatched: Number(betCounts?.matched ?? 0),
    betsSettled: Number(betCounts?.settled ?? 0),
  };
}

export async function getFlaggedBets() {
  const rows = await db
    .select({
      bet: bets,
      matchHome: matches.home,
      matchAway: matches.away,
    })
    .from(bets)
    .innerJoin(matches, eq(matches.id, bets.matchId))
    .where(isNotNull(bets.flaggedReason))
    .orderBy(desc(bets.flaggedAt));

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
