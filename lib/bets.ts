import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { matches, bets, profiles, type MatchRow } from "@/db/schema";
import { eq, asc, desc, inArray, gt, and, sql } from "drizzle-orm";
import type { Duel } from "@/components/feed/duel-post";
import { MOZAMBIQUE_TIMEZONE } from "@/lib/format";

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

type LiveRow = {
  id: string;
  live_home: number | null;
  live_away: number | null;
  live_minute: number | null;
  live_updated_at: string | Date | null;
  live_minute_anchor_at: string | Date | null;
  live_paused: boolean;
};

/** Reads live_* columns for the given matches. Guarded: if migration 0007
 *  hasn't been applied yet the columns don't exist, so we swallow the error
 *  and report no live matches (the feed just shows kickoff times). No
 *  freshness filter here — whether a match is actually live at all is
 *  match_status === 'live' (real, stored state, see
 *  0028_match_live_lifecycle.sql), checked by the caller. Goals are always
 *  manual admin input now (see updateLiveScoreAction) — there's no poller
 *  left that could go stale mid-game. */
async function fetchLiveByMatch(matchIds: string[]): Promise<Map<string, LiveRow>> {
  if (matchIds.length === 0) return new Map();
  try {
    const idList = sql.join(matchIds.map((id) => sql`${id}`), sql`, `);
    const rows = (await db.execute(sql`
      select id, live_home, live_away, live_minute, live_updated_at, live_minute_anchor_at, live_paused
        from public.matches
       where id in (${idList})
    `)) as unknown as LiveRow[];
    return new Map(rows.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

/** Elapsed-minutes label since kickoff — the default "clock" shown for a
 *  live/awaiting-result match with no manual minute override from the admin
 *  (see updateLiveScoreAction). Purely derived, no polling: the same
 *  time-based approach match_advance_lifecycle uses to decide the 90-minute
 *  cutoff (0028_match_live_lifecycle.sql). Past 90 real minutes — which
 *  includes every 'needs_review' match, since that's exactly what triggers
 *  at the 90-minute mark — shown as "90+" (stoppage time), matching how
 *  every football broadcast reads a match still going past regulation,
 *  rather than freezing at a literal "90" that looks stuck. */
function computeElapsedMinuteLabel(kickoffAt: Date): string {
  const minutes = Math.max(0, Math.floor((Date.now() - kickoffAt.getTime()) / 60000));
  return minutes > 90 ? "90+" : String(minutes);
}

/** Real ticking clock anchored to the admin's last checkpoint (migration
 *  0029), not a number frozen forever the moment an admin first types one in.
 *  - No admin entry yet → falls back to computeElapsedMinuteLabel (auto,
 *    capped "90+").
 *  - live_paused → frozen exactly at live_minute (half-time/any break),
 *    however long that lasts.
 *  - Otherwise → live_minute + minutes elapsed since live_minute_anchor_at,
 *    which updateLiveScoreAction resets to now() on every save — so setting
 *    "46" at the second-half restart keeps counting up from 46 instead of
 *    sitting stuck there. */
function computeLiveMinuteLabel(kickoffAt: Date, live: LiveRow | undefined): string {
  if (live?.live_minute == null) return computeElapsedMinuteLabel(kickoffAt);
  if (live.live_paused || !live.live_minute_anchor_at) return String(live.live_minute);
  const anchorMs = new Date(live.live_minute_anchor_at).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - anchorMs) / 60000));
  return String(live.live_minute + elapsed);
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

export type FeedCatalogMatch = {
  id: string;
  home: string;
  away: string;
  league: string;
  leagueId: number | null;
  country: string | null;
  kickoffAt: Date;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  isElimination: boolean;
  /** 'scheduled' | 'live' | 'needs_review' — this list never includes a
   *  terminal status (see getFeedMatchCatalog); used client-side to decide
   *  whether tapping the row opens bet creation or shows the "already
   *  started" explanation instead. */
  matchStatus: string;
  score?: { home: number; away: number };
  minute?: string;
};

/** Every match still worth showing in the feed's "Jogos" tab — unlike
 *  getUpcomingMatches (the bet-creation picker), this also includes
 *  'live'/'needs_review' matches, so a match doesn't just vanish the moment
 *  it kicks off with no bets on it yet. Real complaint this fixes: users
 *  opened the app mid-final with no bets already placed on it and found
 *  nothing, no explanation, just gone. Tapping a started match shows an
 *  explanatory message instead of the bet form — bet_create still rejects
 *  it server-side regardless (see lib/actions/bets.ts); this is purely a
 *  visibility fix, not a change to who can bet when. Uncached, like
 *  getUnsettledMatches/getFeedDuels — a live score staying fresh matters
 *  more here than it does for the picker. */
export async function getFeedMatchCatalog(): Promise<FeedCatalogMatch[]> {
  const rows = await db
    .select()
    .from(matches)
    .where(inArray(matches.matchStatus, ["scheduled", "live", "needs_review"]))
    .orderBy(asc(matches.kickoffAt));

  const startedIds = rows.filter((m) => m.matchStatus !== "scheduled").map((m) => m.id);
  const liveById = await fetchLiveByMatch(startedIds);

  return rows.map((m) => {
    const live = liveById.get(m.id);
    const isStarted = m.matchStatus !== "scheduled";
    return {
      id: m.id,
      home: m.home,
      away: m.away,
      league: m.league,
      leagueId: m.leagueId,
      country: m.country,
      kickoffAt: m.kickoffAt,
      homeLogoUrl: m.homeLogoUrl,
      awayLogoUrl: m.awayLogoUrl,
      isElimination: m.isElimination,
      matchStatus: m.matchStatus,
      score: isStarted && live?.live_home != null && live?.live_away != null ? { home: live.live_home, away: live.live_away } : undefined,
      minute: isStarted ? `${computeLiveMinuteLabel(m.kickoffAt, live)}'${live?.live_paused ? " ⏸" : ""}` : undefined,
    };
  });
}

/** Matches still awaiting a result — the manual settlement tool's worklist.
 *  Covers every pre-terminal state (see 0028_match_live_lifecycle.sql):
 *  'scheduled' (not kicked off yet), 'live' (in its 90-minute window), and
 *  'needs_review' (past 90min with real 'matched' bets — admin was already
 *  notified). Ordered oldest-kickoff-first so the most overdue 'needs_review'
 *  matches surface before matches that haven't even started. */
export async function getUnsettledMatches(): Promise<MatchRow[]> {
  return db
    .select()
    .from(matches)
    .where(inArray(matches.matchStatus, ["scheduled", "live", "needs_review"]))
    .orderBy(asc(matches.kickoffAt));
}

/** Matches already in a terminal state (finished/postponed/abandoned/closed)
 *  — shown in /admin/matches purely so a stale one (e.g. voided by mistake,
 *  or just clutter) can still be removed from the catalogue. Settlement
 *  itself never touches this list. */
export async function getProcessedMatches(): Promise<MatchRow[]> {
  return db
    .select()
    .from(matches)
    .where(inArray(matches.matchStatus, ["finished", "postponed", "abandoned", "closed"]))
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
// Open (joinable) first, then locked (matched, not yet live), then live last
// — an open bet is the one thing an incoming visitor can actually act on, so
// it leads; live duels are already fully spoken for and are really just
// "currently happening" status updates. Array.prototype.sort is stable, so
// within each group the query's own createdAt-desc order is preserved.
const FEED_STATUS_PRIORITY: Record<Duel["status"], number> = { waiting: 0, locked: 1, live: 2, closed: 3 };

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

      // Liveness is a real, stored property of the match now
      // (match_advance_lifecycle flips it at kickoff — see
      // 0028_match_live_lifecycle.sql), not derived from a time window. A
      // "waiting" bet (nobody matched it) never shows as live regardless —
      // there's no real duel in progress to show. 'needs_review' counts as
      // live too: that's the exact state a match sits in from the 90-minute
      // mark until an admin enters the real result, and to a bettor it's
      // still "the match is happening/just ended, awaiting the outcome" —
      // reverting to a plain scheduled-time label the moment the internal
      // 90-minute cutover fires (before any admin has actually settled
      // anything) reads as the match mysteriously going backwards in time.
      const live = liveById.get(match.id);
      const isLive = bet.status === "matched" && (match.matchStatus === "live" || match.matchStatus === "needs_review");

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
          time: new Date(match.kickoffAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: MOZAMBIQUE_TIMEZONE }),
          kickoffAtIso: new Date(match.kickoffAt).toISOString(),
          homeLogoUrl: match.homeLogoUrl,
          awayLogoUrl: match.awayLogoUrl,
        },
        prediction: predictionText,
        predictionCode: pred.code,
        stake: bet.stakeCents / 100,
        stakeCents: bet.stakeCents,
        status: isLive ? "live" : bet.status === "matched" ? "locked" : "waiting",
        createdAgo: new Date(bet.createdAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: MOZAMBIQUE_TIMEZONE }),
        score: isLive && live?.live_home != null && live?.live_away != null ? { home: live.live_home, away: live.live_away } : undefined,
        // Admin's manual minute (see updateLiveScoreAction) keeps ticking up
        // in real time from whatever was last entered, or freezes at that
        // number while paused (half-time/injury break) — see
        // computeLiveMinuteLabel. With no admin entry yet, falls back to the
        // automatic kickoff-based clock.
        minute: isLive ? `${computeLiveMinuteLabel(match.kickoffAt, live)}'${live?.live_paused ? " ⏸" : ""}` : undefined,
      };
    })
    .filter((d): d is Duel => d !== null)
    .sort((a, b) => FEED_STATUS_PRIORITY[a.status] - FEED_STATUS_PRIORITY[b.status]);
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
