import { unstable_cache } from "next/cache";
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
  /** The opponent's own prediction (see db/schema.ts comment) — null until
   *  matched. Always one of the two outcomes the creator DIDN'T predict. */
  opponentPrediction: "home" | "draw" | "away" | null;
  opponentPredictionLabel: string | null;
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
    /** Knockout fixture — no draw outcome, so accepting never offers it. */
    isElimination: boolean;
  };
  creator: { id: string; name: string };
  opponent: { id: string; name: string } | null;
  /** Only meaningful once status === 'settled'. */
  winnerId: string | null;
  /** Only meaningful once status === 'refunded' — the three ways a bet ends
   *  up refunded read very differently to the person looking at this page,
   *  so the UI shouldn't show one blanket "sem adversário" message for all
   *  of them. */
  refundReason: "no_opponent" | "match_voided" | "no_correct_prediction" | null;
};

/** A single bet, shaped for the public receipt/share page (/d/[id]). Reads
 *  via drizzle (bypasses RLS, same as getFeedDuels) so the page works for
 *  logged-out visitors who followed a shared link — that's the whole point
 *  of a share target. Returns null if the bet doesn't exist. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts either the raw bet id (old links, still valid) or its short
 *  reference (DUE-BET-XXXXXXXX — what every new share link/redirect uses,
 *  since a bare UUID in a shared URL reads as a spammy tracking link). */
export async function getBetReceipt(idOrReference: string): Promise<BetReceipt | null> {
  const isUuid = UUID_RE.test(idOrReference);
  const [bet] = await db
    .select()
    .from(bets)
    .where(isUuid ? eq(bets.id, idOrReference) : eq(bets.reference, idOrReference.toUpperCase()))
    .limit(1);
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

  const opponentPrediction = bet.opponentPrediction as BetReceipt["opponentPrediction"];
  const opponentPredictionLabel = opponentPrediction
    ? (() => {
        const p = PREDICTION_LABEL[opponentPrediction];
        return opponentPrediction === "away" ? p.awayLabel(match.away) : p.homeLabel(match.home);
      })()
    : null;

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

  // Three different stories behind "refunded" — no adversary ever showed up,
  // the fixture itself got voided, or (new, three-way market) both sides
  // guessed wrong and the result belonged to neither. Derived rather than
  // stored: match_status/opponent_id/result already carry enough to tell
  // them apart without a new column.
  let refundReason: BetReceipt["refundReason"] = null;
  if (bet.status === "refunded") {
    if (!bet.opponentId) refundReason = "no_opponent";
    else if (match.matchStatus === "postponed" || match.matchStatus === "abandoned") refundReason = "match_voided";
    else refundReason = "no_correct_prediction";
  }

  return {
    id: bet.id,
    reference: bet.reference,
    status: bet.status as BetReceipt["status"],
    prediction: bet.prediction as BetReceipt["prediction"],
    predictionLabel,
    predictionCode: pred.code,
    opponentPrediction,
    opponentPredictionLabel,
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
      isElimination: match.isElimination,
    },
    creator: { id: creator.id, name: creator.displayName },
    opponent: opponent ? { id: opponent.id, name: opponent.displayName } : null,
    winnerId,
    refundReason,
  };
}

/** A live score is only treated as "live" if the poller (or an admin's
 *  manual entry — see updateLiveScoreAction, the only source for matches
 *  with no external_id to auto-poll) refreshed it within this window —
 *  stops a stale "67'" lingering if updates stop or the match ended but
 *  hasn't been settled yet. 90 minutes covers a full match without a
 *  score update in between going stale mid-game. */
const LIVE_FRESHNESS_MS = 90 * 60 * 1000;

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
/** Cached for 60s: this list is the same for every visitor and previously
 *  re-ran from scratch on every /bets/new request. A newly added/edited
 *  match can take up to 60s to show up here — acceptable (nobody's
 *  expecting a just-added fixture to appear instantly) — and a match whose
 *  kickoff just passed can stay listed for up to 60s too, which bet_create
 *  still rejects server-side regardless, so nothing exploitable slips
 *  through the staleness window. Next's newer revalidateTag() needs a cache
 *  "profile" argument this codebase doesn't otherwise use, so this relies
 *  on the plain time-based expiry rather than tag-based invalidation on
 *  write — simpler, and the staleness window is short enough not to
 *  matter here. */
export const getUpcomingMatches = unstable_cache(
  async (): Promise<MatchRow[]> => {
    return db
      .select()
      .from(matches)
      .where(and(gt(matches.kickoffAt, new Date()), eq(matches.matchStatus, "scheduled")))
      .orderBy(matches.kickoffAt);
  },
  ["upcoming-matches"],
  { tags: ["upcoming-matches"], revalidate: 60 }
);

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

      // Liveness is a property of the MATCH, not of something an admin (or
      // the API poller) has to notice and flip — a matched duel (both sides
      // committed, real money on both stakes) is live the moment its
      // scheduled kickoff arrives, for the same 90-minute window the feed
      // already treats live score data as fresh (LIVE_FRESHNESS_MS above).
      // Actual score data, when present, is layered on top; its absence
      // just means "live, score not in yet" rather than "not live". A
      // "waiting" bet (nobody matched it) never shows as live regardless —
      // there's no real duel in progress to show, and Phase B's kickoff
      // check already closes it to new acceptances once kickoff passes.
      const live = liveById.get(match.id);
      const kickoffMs = match.kickoffAt.getTime();
      const withinLiveWindow = Date.now() >= kickoffMs && Date.now() < kickoffMs + LIVE_FRESHNESS_MS;
      const isLive = bet.status === "matched" && (withinLiveWindow || !!live);

      return {
        id: bet.id,
        reference: bet.reference,
        creatorId: bet.creatorId,
        a: { name: creator.displayName, avatar: colorFor(creator.id), city: "" },
        b: opponent ? { name: opponent.displayName, avatar: colorFor(opponent.id), city: "" } : null,
        match: {
          home: match.home,
          away: match.away,
          league: match.league,
          leagueId: match.leagueId,
          country: match.country,
          time: new Date(match.kickoffAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
          kickoffAtIso: new Date(match.kickoffAt).toISOString(),
          homeLogoUrl: match.homeLogoUrl,
          awayLogoUrl: match.awayLogoUrl,
        },
        prediction: predictionText,
        predictionCode: pred.code,
        stake: bet.stakeCents / 100,
        stakeCents: bet.stakeCents,
        status: isLive ? "live" : bet.status === "matched" ? "locked" : "waiting",
        createdAgo: new Date(bet.createdAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        score: isLive && live!.live_home != null && live!.live_away != null ? { home: live!.live_home, away: live!.live_away } : undefined,
        minute: isLive && live!.live_minute != null ? `${live!.live_minute}'` : undefined,
      };
    })
    .filter((d): d is Duel => d !== null);
}

export type RecentWinner = {
  /** Bet id — used as the React key only, nothing links to it yet. */
  id: string;
  name: string;
  avatar: string;
  payoutCents: number;
  match: { home: string; away: string; resultHome: number; resultAway: number };
  settledAt: Date;
};

/** Most recently settled bets, one entry per winner, for the "vencedores
 *  recentes" strip at the top of the feed — social proof that payouts are
 *  real and automatic. Never fabricated: returns an empty list (hidden by
 *  the component) rather than mock winners when nothing has settled yet.
 *
 *  Cached for 30s: every visitor on the landing page was re-running this (a
 *  bets scan + 2 follow-up queries) on every request for a list that's the
 *  same for everyone and only changes when a match gets settled. A winner
 *  showing up to 30s late in this ticker is a non-issue (unlike stale money
 *  data, which this never is — the wallet/receipt pages read straight from
 *  the DB, uncached). Time-based rather than tag-based invalidation for the
 *  same reason as getUpcomingMatches above. */
export const getRecentWinners = unstable_cache(
  async (limit = 12): Promise<RecentWinner[]> => {
  // Settled bets are rare relative to open ones at this stage, so a modest
  // pool re-sorted by actual match settlement time (not bet creation time)
  // is enough to find the true N most recent winners.
  const pool = await db
    .select()
    .from(bets)
    .where(eq(bets.status, "settled"))
    .orderBy(desc(bets.createdAt))
    .limit(Math.max(limit * 5, 30));

  if (pool.length === 0) return [];

  const matchIds = [...new Set(pool.map((r) => r.matchId))];
  const matchRows = await db.select().from(matches).where(inArray(matches.id, matchIds));
  const matchById = new Map(matchRows.map((m) => [m.id, m]));

  const resolved = pool
    .map((bet) => {
      const match = matchById.get(bet.matchId);
      if (!match || match.resultHome == null || match.resultAway == null || !match.settledAt) return null;
      const actual = match.resultHome > match.resultAway ? "home" : match.resultHome < match.resultAway ? "away" : "draw";
      const winnerId = bet.prediction === actual ? bet.creatorId : bet.opponentId;
      if (!winnerId) return null;
      const potCents = bet.stakeCents * 2;
      const payoutCents = potCents - Math.round(potCents * 0.1);
      return { betId: bet.id, winnerId, payoutCents, match, settledAt: match.settledAt };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.settledAt.getTime() - a.settledAt.getTime())
    .slice(0, limit);

  if (resolved.length === 0) return [];

  const winnerIds = [...new Set(resolved.map((r) => r.winnerId))];
  const profileRows = await db.select().from(profiles).where(inArray(profiles.id, winnerIds));
  const profileById = new Map(profileRows.map((p) => [p.id, p]));

  return resolved
    .map((r): RecentWinner | null => {
      const profile = profileById.get(r.winnerId);
      if (!profile) return null;
      return {
        id: r.betId,
        name: profile.displayName,
        avatar: colorFor(profile.id),
        payoutCents: r.payoutCents,
        match: { home: r.match.home, away: r.match.away, resultHome: r.match.resultHome!, resultAway: r.match.resultAway! },
        settledAt: r.settledAt,
      };
    })
    .filter((r): r is RecentWinner => r !== null);
  },
  ["recent-winners"],
  { tags: ["recent-winners"], revalidate: 30 }
);
