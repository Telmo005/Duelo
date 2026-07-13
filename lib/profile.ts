import { db } from "@/db";
import { bets, matches, profiles, type Bet, type MatchRow } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";

/** 1X2 outcome implied by a final score — mirrors bet_settle_match's SQL rule exactly. */
function actualResult(match: MatchRow): "home" | "draw" | "away" | null {
  if (match.resultHome == null || match.resultAway == null) return null;
  if (match.resultHome > match.resultAway) return "home";
  if (match.resultHome < match.resultAway) return "away";
  return "draw";
}

/** Did `userId` win this settled bet? Creator wins when their prediction
 *  matched the result; the opponent (who always bets against the creator's
 *  specific prediction) wins otherwise — same rule bet_settle_match uses. */
function didUserWin(bet: Bet, match: MatchRow, userId: string): boolean | null {
  const actual = actualResult(match);
  if (!actual) return null;
  const creatorWon = bet.prediction === actual;
  return bet.creatorId === userId ? creatorWon : !creatorWon;
}

export type UserStats = {
  totalBets: number;
  wins: number;
  losses: number;
  active: number;
  winRatePct: number;
  totalWageredCents: number;
  netCents: number;
};

/** Caps how many of a user's most recent bets feed the stats card and the
 *  "Minhas Apostas" list — a display/summary concern, not the ledger of
 *  record (settlement payouts are computed inside bet_settle_match, wholly
 *  independent of this). Without a cap these queries grow unbounded with
 *  each user's lifetime activity; nobody realistically has anywhere near
 *  this many bets yet, so it's a safety ceiling, not a real limitation. */
const USER_BETS_LIMIT = 500;

export async function getUserStats(userId: string): Promise<UserStats> {
  const rows = await db
    .select({ bet: bets, match: matches })
    .from(bets)
    .innerJoin(matches, eq(matches.id, bets.matchId))
    .where(or(eq(bets.creatorId, userId), eq(bets.opponentId, userId)))
    .orderBy(desc(bets.createdAt))
    .limit(USER_BETS_LIMIT);

  let wins = 0;
  let losses = 0;
  let active = 0;
  let totalWageredCents = 0;
  let netCents = 0;

  for (const { bet, match } of rows) {
    if (bet.status === "cancelled" || bet.status === "refunded") continue;

    totalWageredCents += bet.stakeCents;

    if (bet.status === "settled") {
      const won = didUserWin(bet, match, userId);
      if (won === true) {
        const payout = Math.round(bet.stakeCents * 2 * 0.9);
        netCents += payout - bet.stakeCents;
        wins += 1;
      } else if (won === false) {
        netCents -= bet.stakeCents;
        losses += 1;
      }
    } else {
      active += 1;
    }
  }

  const decided = wins + losses;
  return {
    totalBets: rows.length,
    wins,
    losses,
    active,
    winRatePct: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    totalWageredCents,
    netCents,
  };
}

export type UserBetRow = Bet & {
  matchHome: string;
  matchAway: string;
  league: string;
  kickoffAt: Date;
  opponentName: string | null;
  won: boolean | null;
  /** Whether the viewing user created this bet (vs. accepted it as opponent) —
   *  `prediction` always stores the creator's pick, so the UI needs this to
   *  phrase it as "your prediction" vs "the prediction you bet against". */
  isCreator: boolean;
};

/** All bets `userId` is party to (creator or opponent), newest first —
 *  the data source for the "Minhas Apostas" hub. */
export async function getUserBets(userId: string): Promise<UserBetRow[]> {
  const rows = await db
    .select({ bet: bets, match: matches })
    .from(bets)
    .innerJoin(matches, eq(matches.id, bets.matchId))
    .where(or(eq(bets.creatorId, userId), eq(bets.opponentId, userId)))
    .orderBy(desc(bets.createdAt))
    .limit(USER_BETS_LIMIT);

  if (rows.length === 0) return [];

  const opponentIds = [...new Set(rows.map((r) => (r.bet.creatorId === userId ? r.bet.opponentId : r.bet.creatorId)).filter((x): x is string => !!x))];
  const opponentProfiles = opponentIds.length > 0
    ? await db.select().from(profiles).where(or(...opponentIds.map((id) => eq(profiles.id, id))))
    : [];
  const nameById = new Map(opponentProfiles.map((p) => [p.id, p.displayName]));

  return rows.map(({ bet, match }) => {
    const opponentId = bet.creatorId === userId ? bet.opponentId : bet.creatorId;
    return {
      ...bet,
      matchHome: match.home,
      matchAway: match.away,
      league: match.league,
      kickoffAt: match.kickoffAt,
      opponentName: opponentId ? nameById.get(opponentId) ?? null : null,
      won: bet.status === "settled" ? didUserWin(bet, match, userId) : null,
      isCreator: bet.creatorId === userId,
    };
  });
}
