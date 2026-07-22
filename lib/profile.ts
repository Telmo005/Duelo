import { db } from "@/db";
import { bets, matches, profiles, type Bet, type MatchRow } from "@/db/schema";
import { eq, or, and, desc, lt, inArray } from "drizzle-orm";
import { resolveOutcome, type Market } from "@/lib/betMarkets";

/** Did `userId` win this settled bet? Creator wins when their prediction
 *  matched the result; the opponent (who always bets against the creator's
 *  specific prediction) wins otherwise — same rule bet_settle_match uses. */
function didUserWin(bet: Bet, match: MatchRow, userId: string): boolean | null {
  if (match.resultHome == null || match.resultAway == null) return null;
  const actual = resolveOutcome(bet.market as Market, bet.line, match.resultHome, match.resultAway);
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

export type UserBetsTab = "all" | "waiting" | "matched" | "done";
export type UserBetsPage = { items: UserBetRow[]; nextCursor: string | null };

const DONE_STATUSES = ["settled", "cancelled", "refunded"] as const;

function tabStatusFilter(tab: UserBetsTab) {
  if (tab === "waiting") return eq(bets.status, "waiting");
  if (tab === "matched") return eq(bets.status, "matched");
  if (tab === "done") return inArray(bets.status, DONE_STATUSES);
  return undefined;
}

/** Same (createdAt, id) composite cursor scheme as getWalletLedger. */
function encodeBetCursor(bet: Bet): string {
  return Buffer.from(`${bet.createdAt.toISOString()}|${bet.id}`).toString("base64url");
}
function decodeBetCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  return { createdAt: new Date(iso), id };
}

/** All bets `userId` is party to (creator or opponent), newest first —
 *  the data source for the "Minhas Apostas" hub. Cursor-paginated per tab
 *  (Todas/Aguardam/Em curso/Concluídas) — each tab is its own filtered,
 *  paginated query server-side, not a client-side `.filter()` over one big
 *  preloaded array, so switching tabs never silently misses older bets
 *  that fell outside whatever was already fetched. */
export async function getUserBets(userId: string, opts: { tab?: UserBetsTab; cursor?: string; limit?: number } = {}): Promise<UserBetsPage> {
  const { tab = "all", cursor, limit = 20 } = opts;

  const conditions = [or(eq(bets.creatorId, userId), eq(bets.opponentId, userId))!];
  const statusFilter = tabStatusFilter(tab);
  if (statusFilter) conditions.push(statusFilter);
  if (cursor) {
    const { createdAt, id } = decodeBetCursor(cursor);
    conditions.push(or(lt(bets.createdAt, createdAt), and(eq(bets.createdAt, createdAt), lt(bets.id, id))!)!);
  }

  const rows = await db
    .select({ bet: bets, match: matches })
    .from(bets)
    .innerJoin(matches, eq(matches.id, bets.matchId))
    .where(and(...conditions))
    .orderBy(desc(bets.createdAt), desc(bets.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  if (pageRows.length === 0) return { items: [], nextCursor: null };

  const opponentIds = [...new Set(pageRows.map((r) => (r.bet.creatorId === userId ? r.bet.opponentId : r.bet.creatorId)).filter((x): x is string => !!x))];
  const opponentProfiles = opponentIds.length > 0
    ? await db.select().from(profiles).where(or(...opponentIds.map((id) => eq(profiles.id, id))))
    : [];
  const nameById = new Map(opponentProfiles.map((p) => [p.id, p.displayName]));

  const items = pageRows.map(({ bet, match }) => {
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

  return { items, nextCursor: hasMore ? encodeBetCursor(pageRows[pageRows.length - 1].bet) : null };
}
