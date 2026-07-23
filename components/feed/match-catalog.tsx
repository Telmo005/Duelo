"use client";

import { useEffect, useMemo, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { toast } from "sonner";
import { Search, CalendarX } from "lucide-react";
import { TeamBadge } from "@/components/match/team-badge";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { Spinner } from "@/components/ui/spinner";
import { groupByLeague } from "@/lib/leagueTiers";

export type CatalogMatch = {
  id: string;
  home: string;
  away: string;
  league: string;
  /** API-Football league identity — null for manually-seeded matches. Two
   *  different countries can have identically-named leagues, so
   *  grouping/ranking uses this instead of the bare name string (see
   *  lib/leagueTiers.ts groupByLeague). */
  leagueId?: number | null;
  country?: string | null;
  kickoffLabel: string;
  /** Raw kickoff instant (ISO) — used to flag a match as started the moment
   *  its kickoff passes client-side, even if the server list (cached up to
   *  60s — see getFeedMatchCatalog in lib/bets.ts) hasn't refreshed yet.
   *  Started matches stay VISIBLE (never removed here) — only the tap
   *  behaviour changes, see StartedRow below. */
  kickoffAtIso: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  isElimination: boolean;
  /** 'scheduled' | 'live' | 'needs_review' — see getFeedMatchCatalog. */
  matchStatus: string;
  score?: { home: number; away: number };
  minute?: string;
};

/** Dims the row and shows a spinner while its navigation to /bets/new is in
 *  flight — same useLinkStatus pattern duel-post.tsx uses for the feed. */
function RowPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]">
      <Spinner className="size-4" />
    </div>
  );
}

/**
 * A match that already kicked off — shown (never hidden, see isStarted)
 * with its live score/minute instead of a kickoff time, but not a link:
 * bet_create rejects already-started matches server-side regardless (see
 * lib/actions/bets.ts), so tapping here explains why instead of leading
 * into a form that would just error out at the end.
 */
function StartedRow({ match: m }: { match: CatalogMatch }) {
  return (
    <button
      type="button"
      onClick={() =>
        toast("Este jogo já começou", {
          description: "Já não é possível criar apostas nele — só antes do apito inicial.",
        })
      }
      className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left opacity-80 transition-colors hover:bg-accent"
    >
      <span className="flex shrink-0 items-center gap-1">
        <TeamBadge name={m.home} logoUrl={m.homeLogoUrl} size={22} />
        <TeamBadge name={m.away} logoUrl={m.awayLogoUrl} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold leading-tight">
          {m.home} <span className="font-normal text-muted-foreground">vs</span> {m.away}
        </p>
      </span>
      <span className="flex shrink-0 flex-col items-end leading-none">
        <span className="flex items-center gap-1 text-xs font-extrabold tabular-nums text-live">
          <span className="size-1.5 shrink-0 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-live" aria-hidden />
          {m.score ? `${m.score.home}-${m.score.away}` : m.matchStatus === "needs_review" ? "Terminado" : "AO VIVO"}
        </span>
        {m.minute && <span className="mt-0.5 text-[9px] font-semibold text-live">{m.minute}</span>}
      </span>
    </button>
  );
}

/**
 * "Jogos" tab — every match still open for betting OR already in progress,
 * browsable instead of having to already know a duel exists to join one.
 * Grouped by league, ordered by the same competition-prestige ranking the
 * feed's own league groups use (lib/leagueTiers.ts), and searchable by
 * team/league name. Tapping an upcoming match jumps straight into bet
 * creation with it preselected (see the matchId query param handling in
 * app/(app)/bets/new/page.tsx); a match already in progress renders as
 * StartedRow instead — visible with its live score, but not tappable into
 * bet creation, since it would only error out at the end anyway.
 * Each row's Link is `prefetch={false}` — see the comment on CardBody in
 * duel-post.tsx for why (eager prefetch of every row scrolling through the
 * viewport both wastes data on slow connections and can make the pending
 * spinner below skip itself entirely).
 */
function isStarted(m: CatalogMatch, now: number): boolean {
  return m.matchStatus !== "scheduled" || new Date(m.kickoffAtIso).getTime() <= now;
}

/** One row — a live/started match renders as StartedRow (not tappable,
 *  bet_create would just reject it), everything else links straight into
 *  bet creation with this match preselected. Pulled out of the render loop
 *  so both sort modes below (grouped by league, or one flat chronological
 *  list) can share it without duplicating the row markup. */
function MatchRow({ match: m, now }: { match: CatalogMatch; now: number }) {
  if (isStarted(m, now)) return <StartedRow match={m} />;
  return (
    <Link
      href={`/bets/new?matchId=${m.id}`}
      prefetch={false}
      className="press relative flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 shadow-[var(--shadow-card)] transition-colors hover:border-primary-30"
    >
      <span className="flex shrink-0 items-center gap-1">
        <TeamBadge name={m.home} logoUrl={m.homeLogoUrl} size={22} />
        <TeamBadge name={m.away} logoUrl={m.awayLogoUrl} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold leading-tight">
          {m.home} <span className="font-normal text-muted-foreground">vs</span> {m.away}
          {m.isElimination && <span className="ml-1.5 text-[10px] font-semibold text-locked">· Eliminação</span>}
        </p>
      </span>
      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{m.kickoffLabel}</span>
      <RowPendingOverlay />
    </Link>
  );
}

type SortMode = "league" | "soon";
const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "league", label: "Melhores campeonatos" },
  { key: "soon", label: "Mais próximos" },
];

export function MatchCatalog({ matches }: { matches: CatalogMatch[] }) {
  const [query, setQuery] = useState("");
  // "league" (default) groups by competition prestige — same ranking the
  // feed's own duel groups use (lib/leagueTiers.ts). "soon" drops the
  // grouping entirely and lists every match in one flat queue ordered by
  // kickoff — a live/already-started match's kickoff is in the past, so it
  // naturally sorts to the very top, then whatever's next, and so on.
  const [sort, setSort] = useState<SortMode>("league");

  // Re-checked every 30s so a match that kicks off while this tab is just
  // sitting open flips from "vs kickoff time" to "started" without a full
  // page reload — it stays visible either way (see isStarted), only the tap
  // behaviour changes (StartedRow instead of a link into bet creation).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = needle ? matches.filter((m) => `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(needle)) : matches;

  const groups = useMemo(
    () => groupByLeague(filtered, (m) => ({ league: m.league, leagueId: m.leagueId, country: m.country })),
    [filtered]
  );

  const chronological = useMemo(
    () => [...filtered].sort((a, b) => new Date(a.kickoffAtIso).getTime() - new Date(b.kickoffAtIso).getTime()),
    [filtered]
  );

  const isEmpty = sort === "league" ? groups.length === 0 : chronological.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar equipa ou liga..." className="pr-8" />
        <Search className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSort(opt.key)}
            className={`press shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              sort === opt.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
            <CalendarX className="size-7" />
          </div>
          <p className="mb-1.5 text-base font-bold">
            {matches.length === 0 ? "Sem jogos disponíveis" : "Nenhum jogo encontrado"}
          </p>
          <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">
            {matches.length === 0
              ? "Ainda não há jogos no catálogo. Volta mais tarde."
              : "Tenta outra equipa ou liga."}
          </p>
        </div>
      ) : sort === "league" ? (
        <div className="flex flex-col gap-4">
          {groups.map(([league, leagueMatches]) => (
            <div key={league} className="flex flex-col gap-1.5">
              <SectionLabel className="mb-0 px-0.5">{league}</SectionLabel>
              {leagueMatches.map((m) => (
                <MatchRow key={m.id} match={m} now={now} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {chronological.map((m) => (
            <MatchRow key={m.id} match={m} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
