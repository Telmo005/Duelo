"use client";

import Link, { useLinkStatus } from "next/link";
import { X, TrendingUp } from "lucide-react";
import { CancelBetButton } from "./cancel-bet-button";
import { TeamBadge } from "@/components/match/team-badge";
import { Spinner } from "@/components/ui/spinner";

export type Duel = {
  id: string;
  /** Short human code (DUE-BET-XXXXXXXX) — used for the share link instead
   *  of the raw id, since a bare UUID in a shared URL reads as a spammy
   *  tracking link. Optional because the logged-out marketing preview
   *  (no real bet backing it) has no reference to give. */
  reference?: string;
  a: { name: string; avatar: string; city: string };
  b: { name: string; avatar: string; city: string } | null;
  match: { home: string; away: string; league: string; time: string; homeLogoUrl?: string | null; awayLogoUrl?: string | null };
  prediction: string;
  predictionCode: string;
  stake: number;
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

/** Dims the row and shows a spinner while its navigation is in flight —
 *  useLinkStatus reads pending state from the nearest enclosing Link. Split
 *  into its own component because that hook only works for a Link's
 *  descendants, and CardBody itself needs to stay a plain function so the
 *  "no real bet" early return below doesn't call a hook conditionally. */
function CardBodyPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
      <Spinner className="size-5" />
    </div>
  );
}

/** Wraps the row in a link to the full duel receipt (/d/[reference]) — only
 *  for real bets. Falls back to a plain div for the logged-out marketing
 *  preview, which has nothing real to link to. `press` gives the same
 *  immediate tap feedback every other pressable element in the app has. */
function CardBody({ duel, className, children }: { duel: Duel; className: string; children: React.ReactNode }) {
  if (!duel.reference) return <div className={className}>{children}</div>;
  return (
    <Link href={`/d/${duel.reference}`} className={`press relative ${className}`}>
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
function TimeSlot({ duel }: { duel: Duel }) {
  const isLive = duel.status === "live" && !!duel.score;

  if (isLive) {
    return (
      <div className="flex w-14 shrink-0 flex-col items-center justify-center leading-none">
        <span className="flex items-center gap-1 text-sm font-extrabold tabular-nums text-live">
          <span className="size-1.5 shrink-0 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-live" aria-hidden />
          {duel.score!.home}-{duel.score!.away}
        </span>
        <span className="mt-0.5 text-[9px] font-semibold text-live/80">{duel.minute}</span>
      </div>
    );
  }

  const [datePart, timePart] = duel.match.time.split(", ");
  const dotClassName = duel.status === "waiting" ? "bg-primary" : "bg-muted-foreground";
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
function MoneySlot({ duel }: { duel: Duel }) {
  const payout = Math.round(duel.stake * 2 * 0.9);

  return (
    <div className="flex w-[76px] shrink-0 flex-col items-end leading-tight">
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{duel.stake.toLocaleString("pt")} MT</span>
      <span className="flex items-center gap-1 text-[15px] font-bold tabular-nums text-success">
        <TrendingUp className="size-3.5 shrink-0" aria-hidden />+{payout.toLocaleString("pt") }
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

  const info = (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <div className="flex shrink-0 items-center gap-1">
        <TeamBadge name={duel.match.home} logoUrl={duel.match.homeLogoUrl} size={18} />
        <TeamBadge name={duel.match.away} logoUrl={duel.match.awayLogoUrl} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold leading-tight">
          {duel.match.home} <span className="font-normal text-muted-foreground">vs</span> {duel.match.away}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {duel.a.name} · {duel.prediction}
        </p>
      </div>
    </div>
  );

  return (
    <article
      className={`flex items-center gap-2 overflow-hidden rounded-lg border bg-card px-2.5 py-2 shadow-[var(--shadow-card)] transition-colors ${
        isWaiting ? "border-primary-30" : "border-border"
      }`}
    >
      {isWaiting && isOwnBet ? (
        <>
          <CardBody duel={duel} className="flex min-w-0 flex-1 items-center gap-2">
            {info}
            <TimeSlot duel={duel} />
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
          <TimeSlot duel={duel} />
          <MoneySlot duel={duel} />
        </CardBody>
      )}
    </article>
  );
}
