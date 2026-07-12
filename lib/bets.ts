import { db } from "@/db";
import { matches, bets, profiles, type MatchRow } from "@/db/schema";
import { eq, ne, desc, inArray, gt, and, sql } from "drizzle-orm";
import type { Duel } from "@/components/feed/duel-post";

export type BetReceipt = {
  id: string;
  reference: string;
  status: "waiting" | "matched" | "cancelled" | "refunded" | "settled";
  prediction: "home" | "draw" | "away";
  predictionLabel: string;
  predictionCode: string;
  stakeCents: number;
  potCents: number;
  commissionCents: number;
  payoutCents: number;
  createdAt: Date;
  match: {
    home: string;
    away: string;
    league: string;
    kickoffAt: Date;
    homeLogoUrl: string | null;
    awayLogoUrl: string | null;
    resultHome: number | null;
    resultAway: number | null;
  };
  creator: { id: string; name: string };
  opponent: { id: string; name: string } | null;
  /** Only meaningful once status === 'settled'. */
  winnerId: string | null;
};

/** A single bet, shaped for the public receipt/share page (/d/[id]). Reads
 *  via drizzle (bypasses RLS, same as getFeedDuels) so the page works for
 *  logged-out visitors who followed a shared link — that's the whole point
 *  of a share target. Returns null if the bet doesn't exist. */
export async function getBetReceipt(betId: string): Promise<BetReceipt | null> {
  const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
  if (!bet) return null;

  const [match] = await db.select().from(matches).where(eq(matches.id, bet.matchId)).limit(1);
  if (!match) return null;

  const userIds = [bet.creatorId, bet.opponentId].filter((x): x is string => !!x);
  const profileRows = await db.select().from(profiles).where(inArray(profiles.id, userIds));
  const profileById = new Map(profileRows.map((p) => [p.id, p]));

  const creator = profileById.get(bet.creatorId);
  if (!creator) return null;
  const opponent = bet.opponentId ? profileById.get(bet.opponentId) : null;

  const pred = PREDICTION_LABEL[bet.prediction];
  const predictionLabel = bet.prediction === "away" ? pred.awayLabel(match.away) : pred.homeLabel(match.home);

  // While waiting, nobody has matched yet (opponent_id is always null here),
  // but the breakdown should still preview what happens once someone does —
  // same projection create-bet-form shows before the bet even exists. Once
  // the bet is no longer waiting, show the real pot: doubled only if an
  // opponent actually joined. A bet can be refunded either before ever
  // matching (bet_auto_refund_expired, no opponent) or after matching but
  // the match got voided (bet_void_match, opponent present), so status alone
  // can't tell us which — opponent_id is the source of truth there.
  const potCents = bet.status === "waiting" ? bet.stakeCents * 2 : bet.stakeCents * (bet.opponentId ? 2 : 1);
  const commissionCents = Math.round(potCents * 0.1);
  const payoutCents = potCents - commissionCents;

  let winnerId: string | null = null;
  if (bet.status === "settled" && match.resultHome != null && match.resultAway != null) {
    const actual = match.resultHome > match.resultAway ? "home" : match.resultHome < match.resultAway ? "away" : "draw";
    winnerId = bet.prediction === actual ? bet.creatorId : bet.opponentId;
  }

  return {
    id: bet.id,
    reference: bet.reference,
    status: bet.status as BetReceipt["status"],
    prediction: bet.prediction as BetReceipt["prediction"],
    predictionLabel,
    predictionCode: pred.code,
    stakeCents: bet.stakeCents,
    potCents,
    commissionCents,
    payoutCents,
    createdAt: bet.createdAt,
    match: {
      home: match.home,
      away: match.away,
      league: match.league,
      kickoffAt: match.kickoffAt,
      homeLogoUrl: match.homeLogoUrl,
      awayLogoUrl: match.awayLogoUrl,
      resultHome: match.resultHome,
      resultAway: match.resultAway,
    },
    creator: { id: creator.id, name: creator.displayName },
    opponent: opponent ? { id: opponent.id, name: opponent.displayName } : null,
    winnerId,
  };
}

/** A live score is only treated as "live" if the poller refreshed it within
 *  this window — stops a stale "67'" lingering if the cron stops or the match
 *  ended but hasn't been settled yet. */
const LIVE_FRESHNESS_MS = 20 * 60 * 1000;

type LiveRow = {
  id: string;
  live_home: number | null;
  live_away: number | null;
  live_minute: number | null;
  live_updated_at: string | Date | null;
};

/** Reads live_* columns for the given matches. Guarded: if migration 0007
 *  hasn't been applied yet the columns don't exist, so we swallow the error
 *  and report no live matches (the feed just shows kickoff times). */
async function fetchLiveByMatch(matchIds: string[]): Promise<Map<string, LiveRow>> {
  if (matchIds.length === 0) return new Map();
  try {
    const idList = sql.join(matchIds.map((id) => sql`${id}`), sql`, `);
    const rows = (await db.execute(sql`
      select id, live_home, live_away, live_minute, live_updated_at
        from public.matches
       where id in (${idList})
    `)) as unknown as LiveRow[];
    const now = Date.now();
    return new Map(
      rows
        .filter((r) => r.live_updated_at != null && now - new Date(r.live_updated_at).getTime() < LIVE_FRESHNESS_MS && r.live_minute != null)
        .map((r) => [r.id, r]),
    );
  } catch {
    return new Map();
  }
}

/** Fixtures a user can still bet on: kickoff strictly in the future AND
 *  still 'scheduled'. bet_create rejects already-started matches
 *  server-side, but filtering here keeps them out of the picker so the
 *  user never selects a match only to be told it already began — and,
 *  just as importantly, never selects one an admin already marked
 *  postponed/abandoned (its kickoff time can still be in the future even
 *  though there's nothing left to bet on). */
export async function getUpcomingMatches(): Promise<MatchRow[]> {
  return db
    .select()
    .from(matches)
    .where(and(gt(matches.kickoffAt, new Date()), eq(matches.matchStatus, "scheduled")))
    .orderBy(matches.kickoffAt);
}

/** Matches still awaiting a result — the manual settlement tool's worklist. */
export async function getUnsettledMatches(): Promise<MatchRow[]> {
  return db.select().from(matches).where(eq(matches.matchStatus, "scheduled")).orderBy(desc(matches.kickoffAt));
}

/** Matches already processed (postponed/abandoned/finished) — shown in
 *  /admin/matches purely so a stale one (e.g. voided by mistake, or just
 *  clutter) can still be removed from the catalogue. Settlement itself
 *  never touches this list. */
export async function getProcessedMatches(): Promise<MatchRow[]> {
  return db
    .select()
    .from(matches)
    .where(ne(matches.matchStatus, "scheduled"))
    .orderBy(desc(matches.kickoffAt));
}

const AVATAR_COLORS = ["#F2C22A", "#9C98F7", "#34D399", "#F0455B", "#8B7CFF"];
function colorFor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const PREDICTION_LABEL: Record<string, { code: string; homeLabel: (h: string) => string; awayLabel: (a: string) => string }> = {
  home: { code: "1", homeLabel: (h) => `${h} ganha`, awayLabel: () => "" },
  draw: { code: "X", homeLabel: () => "Empate", awayLabel: () => "" },
  away: { code: "2", homeLabel: () => "", awayLabel: (a) => `${a} ganha` },
};

/** Real open/matched bets, shaped for the DuelPost feed component. */
export async function getFeedDuels(limit = 30): Promise<Duel[]> {
  const rows = await db
    .select()
    .from(bets)
    .where(inArray(bets.status, ["waiting", "matched"]))
    .orderBy(desc(bets.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const matchIds = [...new Set(rows.map((r) => r.matchId))];
  const userIds = [...new Set(rows.flatMap((r) => [r.creatorId, r.opponentId].filter((x): x is string => !!x)))];

  const [matchRows, profileRows, liveById] = await Promise.all([
    db.select().from(matches).where(inArray(matches.id, matchIds)),
    db.select().from(profiles).where(inArray(profiles.id, userIds)),
    fetchLiveByMatch(matchIds),
  ]);

  const matchById = new Map(matchRows.map((m) => [m.id, m]));
  const profileById = new Map(profileRows.map((p) => [p.id, p]));

  return rows
    .map((bet): Duel | null => {
      const match = matchById.get(bet.matchId);
      const creator = profileById.get(bet.creatorId);
      if (!match || !creator) return null;

      const pred = PREDICTION_LABEL[bet.prediction];
      const predictionText = bet.prediction === "away" ? pred.awayLabel(match.away) : pred.homeLabel(match.home);

      const opponent = bet.opponentId ? profileById.get(bet.opponentId) : null;

      // A matched bet on a match the poller has fresh live data for shows the
      // live scoreboard; otherwise it's a normal "open" (accepted) duel.
      const live = liveById.get(match.id);
      const showLive = bet.status === "matched" && !!live;

      return {
        id: bet.id,
        creatorId: bet.creatorId,
        a: { name: creator.displayName, avatar: colorFor(creator.id), city: "" },
        b: opponent ? { name: opponent.displayName, avatar: colorFor(opponent.id), city: "" } : null,
        match: {
          home: match.home,
          away: match.away,
          league: match.league,
          time: new Date(match.kickoffAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
          homeLogoUrl: match.homeLogoUrl,
          awayLogoUrl: match.awayLogoUrl,
        },
        prediction: predictionText,
        predictionCode: pred.code,
        stake: bet.stakeCents / 100,
        status: bet.status === "matched" ? (showLive ? "live" : "open") : "waiting",
        createdAgo: new Date(bet.createdAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        score: showLive && live!.live_home != null && live!.live_away != null ? { home: live!.live_home, away: live!.live_away } : undefined,
        minute: showLive && live!.live_minute != null ? `${live!.live_minute}'` : undefined,
      };
    })
    .filter((d): d is Duel => d !== null);
}
