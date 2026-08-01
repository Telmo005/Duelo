import { db } from "@/db";
import { affiliateLedger, platformSettings, profiles } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export type AffiliateSummary = {
  referralCode: string;
  referredCount: number;
  totalEarnedCents: number;
  /** Current share of the house commission a referral pays out, e.g. 30 —
   *  read live from platform_settings, never hardcoded in the UI, since an
   *  admin can change it (see /admin/afiliados). */
  referralSharePct: number;
};

/** getAffiliateSummary — the user's own referral dashboard header
 *  (código, quantos referiu, quanto já ganhou). Mirrors the read style of
 *  lib/profile.ts's getUserStats — plain Drizzle aggregates, no RPC. */
export async function getAffiliateSummary(userId: string): Promise<AffiliateSummary> {
  const [profile] = await db.select({ referralCode: profiles.referralCode }).from(profiles).where(eq(profiles.id, userId)).limit(1);

  const [referredTotals] = await db
    .select({ count: sql<number>`count(*)` })
    .from(profiles)
    .where(eq(profiles.referredBy, userId));

  const [earnedTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${affiliateLedger.payoutCents}), 0)` })
    .from(affiliateLedger)
    .where(eq(affiliateLedger.referrerId, userId));

  const [settings] = await db.select({ referralShareBps: platformSettings.referralShareBps }).from(platformSettings).limit(1);

  return {
    referralCode: profile?.referralCode ?? "",
    referredCount: Number(referredTotals?.count ?? 0),
    totalEarnedCents: Number(earnedTotals?.total ?? 0),
    referralSharePct: (settings?.referralShareBps ?? 3000) / 100,
  };
}

export type ReferredUser = {
  id: string;
  displayName: string;
  createdAt: Date;
};

const REFERRED_USERS_LIMIT = 200;

/** getReferredUsers — everyone this user has referred, newest first. Same
 *  cap-not-cursor approach as USER_BETS_LIMIT in lib/profile.ts — a
 *  display ceiling, not the source of truth (that's the count in
 *  getAffiliateSummary, a separate unlimited aggregate). */
export async function getReferredUsers(userId: string): Promise<ReferredUser[]> {
  return db
    .select({ id: profiles.id, displayName: profiles.displayName, createdAt: profiles.createdAt })
    .from(profiles)
    .where(eq(profiles.referredBy, userId))
    .orderBy(desc(profiles.createdAt))
    .limit(REFERRED_USERS_LIMIT);
}
