"use client";

import Link, { useLinkStatus } from "next/link";
import { X, TrendingUp, Lock } from "lucide-react";
import { CancelBetButton } from "./cancel-bet-button";
import { TeamBadge } from "@/components/match/team-badge";
import { Spinner } from "@/components/ui/spinner";
import { formatCentsAsMt } from "@/lib/format";
import { MARKET_EMOJI, MARKET_EMOJI_GRAYSCALE, type Market } from "@/lib/betMarkets";

export type Duel = {
  id: string;
  /** Short human code (DUE-BET-XXXXXXXX) — used for the share link instead
   *  of the raw id, since a bare UUID in a shared URL reads as a spammy
   *  tracking link. Optional because the logged-out marketing preview
   *  (no real bet backing it) has no reference to give. */
  reference?: string;
  a: { name: string; avatar: string; city: string };
  b: { name: string; avatar: string; city: string } | null;
  match: {
    home: string;
    away: string;
    league: string;
    /** football-data.org league identity — null for manually-seeded matches. Two
     *  different countries can have identically-named leagues (both call it
     *  "Premier League"), so grouping/ranking uses this instead of the bare
     *  name string (see lib/leagueTiers.ts groupByLeague). */
    leagueId?: number | null;
    country?: string | null;
    time: string;
    /** Raw kickoff instant (ISO) — used to tell whether a "waiting" bet is
     *  still genuinely joinable. `bet.status` alone lags reality: it only
     *  flips off "waiting" once someone accepts, or once the
     *  bet_auto_refund_expired cron next runs — neither is instant, so a
     *  bet can sit "waiting" for a match that's already kicked off (or
     *  live) with nothing to stop the UI still inviting a tap to accept. */
    kickoffAtIso: string;
    homeLogoUrl?: string | null;
    awayLogoUrl?: string | null;
  };
  /** Which market this bet is on — drives the small icon shown next to the
   *  prediction text below (see MarketIcon), so a scrolling feed reads at a
   *  glance which duels are golos/ambas-marcam/resultado without having to
   *  parse the prediction text itself. */
  market: Market;
  prediction: string;
  predictionCode: string;
  stake: number;
  /** Raw integer cents — lets the payout preview below match the server's
   *  own math exactly (see MoneySlot) instead of re-deriving it from the
   *  already-divided `stake` float and rounding to a whole MT, which can
   *  show a fabricated number that doesn't match what anyone would actually
   *  be paid. */
  stakeCents: number;
  /** "locked" = matched, both sides committed, nothing left to accept —
   *  distinct from "waiting" ("Aguarda adversário", still joinable) so the
   *  label never implies there's still something to do with it. "closed"
   *  only ever appears in the logged-out marketing preview's demo data
   *  (a finished/settled example) — the real feed never produces it. */
  status: "locked" | "live" | "waiting" | "closed";
  createdAgo: string;
  /** Present when this Duel came from a real bet row — needed to tell
   *  the creator's own "waiting" bet apart so we can offer "Cancelar"
   *  instead of "Aceitar". Absent for the logged-out marketing preview. */
  creatorId?: string;
  /** Live-match data (status "live" only). Populated from a live results
   *  feed; until that's wired up it only appears on the marketing preview. */
  score?: { home: number; away: number };
  minute?: string;
};

/** Small emoji marker for which market a duel is on — 🏆 for 1x2 (who wins),
 *  ⚽ for total_goals, 🤝 for btts (same mapping the market-picker step in
 *  create-bet-form.tsx and the receipt card use, via lib/betMarkets.ts's
 *  MARKET_EMOJI, so the two never drift apart). Lets someone scanning a long
 *  feed tell golos/ambas-marcam/resultado duels apart without reading the
 *  full prediction text on every row. */
function MarketIcon({ market }: { market: Market }) {
  return (
    <span className={`shrink-0 text-[13px] leading-none ${MARKET_EMOJI_GRAYSCALE[market] ? "grayscale" : ""}`} aria-hidden>
      {MARKET_EMOJI[market]}
    </span>
  );
}

/** Dims the row and shows a spinner while its navigation is in flight —
 *  useLinkStatus reads pending state from the nearest enclosing Link. Split
 *  into its own component because that hook only works for a Link's
 *  descendants, and CardBody itself needs to stay a plain function so the
 *  "no real bet" early return below doesn't call a hook conditionally. */
function CardBodyPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]">
      <Spinner className="size-5" />
    </div>
  );
}

/** Wraps the row in a link to the full duel receipt (/d/[reference]) — only
 *  for real bets. Falls back to a plain div for the logged-out marketing
 *  preview, which has nothing real to link to. `press` gives the same
 *  immediate tap feedback every other pressable element in the app has.
 *  `prefetch={false}`: this is a scrollable list, so every row that drifts
 *  through the viewport would otherwise get eagerly prefetched — besides
 *  the wasted data on the slow connections this app targets, a route
 *  Next.js already fetched ahead of time finishes too fast for the pending
 *  overlay above to ever have a chance to render (see Next's useLinkStatus
 *  docs: "If the linked route has been prefetched, the pending state will
 *  be skipped"). A real tap still triggers an actual navigation either way
 *  — this only stops the silent background prefetch. */
function CardBody({ duel, className, children }: { duel: Duel; className: string; children: React.ReactNode }) {
  if (!duel.reference) return <div className={className}>{children}</div>;
  return (
    <Link href={`/d/${duel.reference}`} prefetch={false} className={`press relative ${className}`}>
      {children}
      <CardBodyPendingOverlay />
    </Link>
  );
}

/** The middle "when" slot — always occupies the same spot and width whether
 *  the match hasn't kicked off yet (date/time) or is live right now (score +
 *  minute). Both states lead with the same device — a small status dot —
 *  so the eye reads one consistent column down the whole feed: red +
 *  pulsing = live, amber = still open, grey = matched and waiting on
 *  kickoff. */
function TimeSlot({ duel, canJoin }: { duel: Duel; canJoin: boolean }) {
  const isLive = duel.status === "live";

  if (isLive) {
    // Live kicks in from the match's scheduled kickoff time alone (see
    // isLive in lib/bets.ts) — actual goals/minute only show up once the
    // poller (or an admin) has entered them, so "no score yet" still reads
    // as live, just without digits, instead of falling back to a stale
    // pre-kickoff date/time.
    const hasScore = !!duel.score;
    return (
      <div className="flex w-14 shrink-0 flex-col items-center justify-center leading-none">
        {hasScore ? (
          <span className="flex items-center gap-1 text-sm font-extrabold tabular-nums text-live">
            <span className="size-1.5 shrink-0 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-live" aria-hidden />
            {duel.score!.home}-{duel.score!.away}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-extrabold text-live">
            <span className="size-1.5 shrink-0 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-live" aria-hidden />
            AO VIVO
          </span>
        )}
        {duel.minute && <span className="mt-0.5 text-[9px] font-semibold text-live/80">{duel.minute}</span>}
      </div>
    );
  }

  const [datePart, timePart] = duel.match.time.split(", ");
  const dotClassName = canJoin ? "bg-primary" : "bg-muted-foreground";
  return (
    <div className="flex w-14 shrink-0 flex-col items-center justify-center leading-none text-muted-foreground">
      <span className="flex items-center gap-1 text-[9px] font-medium">
        <span className={`size-1.5 shrink-0 rounded-full ${dotClassName}`} aria-hidden />
        {datePart}
      </span>
      <span className="mt-0.5 text-[13px] font-bold tabular-nums text-foreground">{timePart ?? duel.match.time}</span>
    </div>
  );
}

/** The right-hand "why should I care" slot — always the stake next to what
 *  it turns into, because seeing cash on the line (and growing) is what
 *  actually pulls someone in. Shown the same way for every duel — open,
 *  matched, or live — status is already carried by the dot in TimeSlot, so
 *  this column stays pure money. */
function MoneySlot({ duel, canJoin }: { duel: Duel; canJoin: boolean }) {
  // Cents-exact, matching bet_settle_match's own math (supabase/migrations
  // 0003_settlement.sql: pot = stake*2, commission = round(pot*0.10),
  // payout = pot - commission) — NOT a whole-MT rounding of the display
  // value. A stake of 12,50 MT has a real payout of 22,50 MT, and rounding
  // that to "23" in the feed would show a number nobody's actually going to
  // receive.
  const potCents = duel.stakeCents * 2;
  const commissionCents = Math.round(potCents * 0.1);
  const payoutCents = potCents - commissionCents;
  const stakeLabel = formatCentsAsMt(duel.stakeCents);
  const payoutLabel = formatCentsAsMt(payoutCents);

  // Already a real, locked-in duel (matched — "locked" or "live") — the
  // stake is committed either way, so what's actually interesting now is
  // what it turns into, not what went in. Muted grey (not the success green
  // used for the still-joinable preview below) — this isn't a "come join"
  // hook anymore, just an informational amount.
  if (duel.status === "locked" || duel.status === "live") {
    return (
      <div className="flex w-[76px] shrink-0 items-center justify-end">
        <span className="flex items-center gap-1 text-[15px] font-bold tabular-nums text-muted-foreground">
          <TrendingUp className="size-3.5 shrink-0" aria-hidden />+{payoutLabel}
        </span>
      </div>
    );
  }

  // Not joinable and not a locked duel either (waiting on a match that
  // already kicked off, or the closed marketing-preview state) — no "why
  // should I care" hook left to sell, just the stake that was on the table.
  if (!canJoin) {
    return (
      <div className="flex w-[76px] shrink-0 items-center justify-end">
        <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{stakeLabel} MT</span>
      </div>
    );
  }

  return (
    <div className="flex w-[76px] shrink-0 flex-col items-end leading-tight">
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{stakeLabel} MT</span>
      <span className="flex items-center gap-1 text-[15px] font-bold tabular-nums text-success">
        <TrendingUp className="size-3.5 shrink-0" aria-hidden />+{payoutLabel}
      </span>
    </div>
  );
}

/** A single duel, rendered as a compact scoreboard row split into three
 *  fixed zones — match (left, flexible), when (middle, fixed), money (right,
 *  fixed) — so every row in the feed lines up the same way no matter its
 *  state. No "DESAFIAR" button, no avatar: the entire row is the tap target,
 *  and taps through to the full receipt page for waiting duels
 *  (match/previsão/valor laid out before the confirm). */
export function DuelPost({
  duel,
  live = false,
  currentUserId,
}: {
  duel: Duel;
  /** true = real bet with working Aceitar/Cancelar actions; false (default) = logged-out marketing preview linking to /register. */
  live?: boolean;
  currentUserId?: string;
}) {
  const isWaiting = duel.status === "waiting";
  const isOwnBet = live && duel.creatorId === currentUserId;
  const hasKickedOff = new Date(duel.match.kickoffAtIso).getTime() <= Date.now();
  const canJoin = isWaiting && !hasKickedOff;
  // "locked"/"live" both mean a second bettor already committed — nothing
  // left to accept here. The dot colour in TimeSlot and the muted MoneySlot
  // already hint at this, but both are subtle enough that a first-time
  // visitor reliably misses them (real feedback) — this badge says it
  // outright, in words, right on the line the eye hits first.
  const isMatched = duel.status === "locked" || duel.status === "live";

  const info = (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <div className="flex shrink-0 items-center gap-1">
        <TeamBadge name={duel.match.home} logoUrl={duel.match.homeLogoUrl} size={18} />
        <TeamBadge name={duel.match.away} logoUrl={duel.match.awayLogoUrl} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <p className="min-w-0 truncate text-[13px] font-bold leading-tight">
            {duel.match.home} <span className="font-normal text-muted-foreground">vs</span> {duel.match.away}
          </p>
          {isMatched && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-locked-10 px-1.5 py-[1px] text-[9px] font-bold text-locked">
              <Lock className="size-2.5 shrink-0" aria-hidden />
              Fechado
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1">
          <MarketIcon market={duel.market} />
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {duel.a.name} · {duel.prediction}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <article
      className={`flex items-center gap-2 overflow-hidden rounded-lg border bg-card px-2.5 py-2 shadow-[var(--shadow-card)] transition-colors ${
        canJoin ? "border-primary-30" : "border-border"
      }`}
    >
      {isWaiting && isOwnBet ? (
        <>
          <CardBody duel={duel} className="flex min-w-0 flex-1 items-center gap-2">
            {info}
            <TimeSlot duel={duel} canJoin={canJoin} />
          </CardBody>
          <CancelBetButton
            betId={duel.id}
            icon={<X className="size-3.5" aria-hidden />}
            label="Cancelar"
            className="press flex shrink-0 items-center gap-1 rounded-lg border border-destructive-30 px-2.5 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive-10 disabled:opacity-60"
          />
        </>
      ) : (
        <CardBody duel={duel} className="flex min-w-0 flex-1 items-center gap-2">
          {info}
          <TimeSlot duel={duel} canJoin={canJoin} />
          <MoneySlot duel={duel} canJoin={canJoin} />
        </CardBody>
      )}
    </article>
  );
}
