import { Trophy } from "lucide-react";
import type { RecentWinner } from "@/lib/bets";

function WinnerChip({ winner, duplicate }: { winner: RecentWinner; duplicate?: boolean }) {
  return (
    <div
      aria-hidden={duplicate}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-success-25 bg-success-10 py-1.5 pl-1.5 pr-3"
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: winner.avatar }}
        aria-hidden
      >
        {winner.name.charAt(0).toUpperCase()}
      </span>
      <p className="text-xs">
        <span className="font-bold">{winner.name}</span>
        <span className="text-muted-foreground"> ganhou </span>
        <span className="font-extrabold text-success">MT {(winner.payoutCents / 100).toLocaleString("pt")}</span>
        <span className="text-muted-foreground">
          {" "}
          · {winner.match.home} {winner.match.resultHome}-{winner.match.resultAway} {winner.match.away}
        </span>
      </p>
    </div>
  );
}

/** Auto-scrolling ticker of recently settled duels — social proof that
 *  payouts are real and automatic, styled like a news-channel lower third
 *  rather than a manually-swiped strip. Hidden entirely when there's
 *  nothing settled yet (never fakes activity, matches the empty-feed
 *  pattern elsewhere in the app). The track renders the winner list twice
 *  back-to-back and animates exactly -50% so the loop is seamless; the
 *  second copy is aria-hidden so screen readers only hear it once. Pauses
 *  on hover/focus and honours prefers-reduced-motion (see .marquee-track
 *  in globals.css). */
export function RecentWinners({ winners }: { winners: RecentWinner[] }) {
  if (winners.length === 0) return null;

  // Slower for a longer list so each chip gets roughly the same time on
  // screen regardless of how many there are.
  const durationSeconds = Math.max(winners.length * 4, 16);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 px-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Trophy className="size-3.5 text-primary" aria-hidden />
        Vencedores recentes
      </p>
      <div className="w-full overflow-hidden">
        <div
          className="marquee-track flex w-max gap-2"
          style={{ "--marquee-duration": `${durationSeconds}s` } as React.CSSProperties}
        >
          {winners.map((w) => (
            <WinnerChip key={w.id} winner={w} />
          ))}
          {winners.map((w) => (
            <WinnerChip key={`dup-${w.id}`} winner={w} duplicate />
          ))}
        </div>
      </div>
    </div>
  );
}
