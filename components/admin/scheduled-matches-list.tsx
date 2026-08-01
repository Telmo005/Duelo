"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SettleMatchRow } from "@/components/admin/settle-match-row";
import { Input } from "@/components/ui/input";
import { groupByLeague } from "@/lib/leagueTiers";
import type { MatchRow } from "@/db/schema";

type SortMode = "date" | "league" | "featured";
const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "date", label: "Data" },
  { key: "league", label: "Liga" },
  { key: "featured", label: "Destacados primeiro" },
];

/**
 * Search + sort wrapper around the "Agendado" worklist in /admin/matches —
 * a flat, unfiltered, kickoff-ordered list stopped scaling once there were
 * enough scheduled fixtures across enough competitions to make finding one
 * specific match a scroll-and-squint exercise. `autoFeaturedIds` is
 * precomputed server-side (pickFeatured against this same scheduled set) so
 * SettleMatchRow can show an admin WHY a match is currently sitting in the
 * feed's Destaques strip even when they never toggled "Destacar" themselves
 * — the algorithm can put a match there on its own merit (competition
 * prestige, soonest kickoff), and that's easy to mistake for the manual pin
 * being silently broken if nothing distinguishes the two.
 */
export function ScheduledMatchesList({ matches, autoFeaturedIds }: { matches: MatchRow[]; autoFeaturedIds: string[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("date");
  const autoFeaturedSet = useMemo(() => new Set(autoFeaturedIds), [autoFeaturedIds]);

  const needle = query.trim().toLowerCase();
  const filtered = needle ? matches.filter((m) => `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(needle)) : matches;

  const sorted = useMemo(() => {
    if (sort === "league") {
      return groupByLeague(filtered, (m) => ({ league: m.league, leagueId: m.leagueId, country: m.country })).flatMap(([, group]) => group);
    }
    if (sort === "featured") {
      return [...filtered].sort((a, b) => {
        const aFirst = a.featured || autoFeaturedSet.has(a.id) ? 0 : 1;
        const bFirst = b.featured || autoFeaturedSet.has(b.id) ? 0 : 1;
        if (aFirst !== bFirst) return aFirst - bFirst;
        return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
      });
    }
    // "date" — matches already arrive soonest-kickoff-first from the server.
    return filtered;
  }, [filtered, sort, autoFeaturedSet]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar equipa ou liga..." className="pr-8" />
          <Search className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto">
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
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum jogo encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {sorted.map((match) => (
            <SettleMatchRow key={match.id} match={match} isAutoFeatured={autoFeaturedSet.has(match.id) && !match.featured} />
          ))}
        </div>
      )}
    </div>
  );
}
