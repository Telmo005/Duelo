"use client";

import { useEffect, useMemo, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { Search, CalendarX } from "lucide-react";
import { TeamBadge } from "@/components/match/team-badge";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { Spinner } from "@/components/ui/spinner";
import { leagueRank } from "@/lib/leagueTiers";

export type CatalogMatch = {
  id: string;
  home: string;
  away: string;
  league: string;
  kickoffLabel: string;
  /** Raw kickoff instant (ISO) — lets the catalogue drop a match the moment
   *  its kickoff passes, even if the server list (getUpcomingMatches, cached
   *  up to 60s — see lib/bets.ts) hasn't refreshed yet, or the tab has just
   *  been sitting open since before kickoff. */
  kickoffAtIso: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  isElimination: boolean;
};

/** Dims the row and shows a spinner while its navigation to /bets/new is in
 *  flight — same useLinkStatus pattern duel-post.tsx uses for the feed. */
function RowPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
      <Spinner className="size-4" />
    </div>
  );
}

/**
 * "Jogos" tab — every match still open for betting, browsable instead of
 * having to already know a duel exists to join one. Grouped by league,
 * ordered by the same competition-prestige ranking the feed's own league
 * groups use (lib/leagueTiers.ts), and searchable by team/league name.
 * Tapping a match jumps straight into bet creation with it preselected
 * (see the matchId query param handling in app/(app)/bets/new/page.tsx).
 */
export function MatchCatalog({ matches }: { matches: CatalogMatch[] }) {
  const [query, setQuery] = useState("");

  // Re-checked every 30s so a match that kicks off while this tab is just
  // sitting open actually disappears, not only on the next full page load.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const open = useMemo(() => matches.filter((m) => new Date(m.kickoffAtIso).getTime() > now), [matches, now]);

  const needle = query.trim().toLowerCase();
  const filtered = needle ? open.filter((m) => `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(needle)) : open;

  const groups = useMemo(() => {
    const byLeague = new Map<string, CatalogMatch[]>();
    for (const m of filtered) {
      if (!byLeague.has(m.league)) byLeague.set(m.league, []);
      byLeague.get(m.league)!.push(m);
    }
    return [...byLeague.entries()].sort(([a], [b]) => leagueRank(a) - leagueRank(b));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar equipa ou liga..." className="pr-8" />
        <Search className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
            <CalendarX className="size-7" />
          </div>
          <p className="mb-1.5 text-base font-bold">
            {open.length === 0 ? "Sem jogos disponíveis" : "Nenhum jogo encontrado"}
          </p>
          <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">
            {open.length === 0
              ? "Ainda não há jogos abertos para apostar. Volta mais tarde."
              : "Tenta outra equipa ou liga."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([league, leagueMatches]) => (
            <div key={league} className="flex flex-col gap-1.5">
              <SectionLabel className="mb-0 px-0.5">{league}</SectionLabel>
              {leagueMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/bets/new?matchId=${m.id}`}
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
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
