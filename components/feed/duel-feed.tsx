"use client";

import { useMemo, useState } from "react";
import { CheckCheck, LayoutGrid } from "lucide-react";
import { DuelPost, type Duel } from "./duel-post";
import { SectionLabel } from "@/components/ui/section-label";

/** Icon-first, one-word filters — the earlier "Aguardam adversário" /
 *  "Trancados" text pills plus a decorative dot-strip underneath were pure
 *  clutter. Each icon echoes the same status glyph used on the row itself
 *  (see StatusIndicator in duel-post.tsx), so the filter reads as "show me
 *  rows with this dot" rather than introducing a second vocabulary. */
const FILTERS = [
  { key: "all", label: "Todos", icon: LayoutGrid },
  { key: "waiting", label: "Abertos", dotClassName: "bg-primary" },
  { key: "locked", label: "Trancados", icon: CheckCheck },
  { key: "live", label: "Ao vivo", dotClassName: "bg-live animate-[pulse-dot_1.2s_ease-in-out_infinite]" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** League display order — not alphabetical, not recency, but relevance to
 *  Duelo's actual audience: Moçambola leads (the flagship local league this
 *  product is built around — see CLAUDE.md's market constraints), then the
 *  Mundial (whatever World Cup cycle is live draws the most attention of
 *  anything on the calendar), then the three other named v1 competitions in
 *  their usual prestige order. Anything else not in this list (a league
 *  added later) falls back after all of these, ordered by recency — so a
 *  new competition never needs this list touched just to show up. */
const LEAGUE_PRIORITY = ["Moçambola", "Mundial", "Champions League", "Premier League", "La Liga"];

function leagueRank(league: string): number {
  const i = LEAGUE_PRIORITY.indexOf(league);
  return i === -1 ? LEAGUE_PRIORITY.length : i;
}

export function DuelFeed({ duels, live = false, currentUserId }: { duels: Duel[]; live?: boolean; currentUserId?: string }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = filter === "all" ? duels : duels.filter((d) => d.status === filter);
  const activeLabel = FILTERS.find((f) => f.key === filter)?.label ?? "";

  // Grouped by league so a Moçambola fan isn't scrolling past a wall of
  // Champions League duels to find their game. Groups themselves are then
  // ordered by relevance (see LEAGUE_PRIORITY), not by whichever league
  // happened to have the most recent bet — recency only breaks ties within
  // that ranking (Array.sort is stable, and a Map preserves insertion
  // order, so unranked/tied leagues keep the recency order they arrived in).
  const groups = useMemo(() => {
    const byLeague = new Map<string, Duel[]>();
    for (const duel of filtered) {
      const league = duel.match.league;
      if (!byLeague.has(league)) byLeague.set(league, []);
      byLeague.get(league)!.push(duel);
    }
    return [...byLeague.entries()].sort(([a], [b]) => leagueRank(a) - leagueRank(b));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const Icon = "icon" in f ? f.icon : null;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={isActive}
              className={`press flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-[0_0_16px_rgba(242,194,42,0.45)]"
                  : "border border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {Icon ? (
                <Icon className="size-3.5" aria-hidden />
              ) : (
                <span className={`size-2 rounded-full ${"dotClassName" in f ? f.dotClassName : ""}`} aria-hidden />
              )}
              {f.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum duelo &ldquo;{activeLabel.toLowerCase()}&rdquo; neste momento.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([league, leagueDuels]) => (
            <div key={league} className="flex flex-col gap-1.5">
              <SectionLabel className="mb-0 px-0.5">{league}</SectionLabel>
              {leagueDuels.map((duel) => (
                <DuelPost key={duel.id} duel={duel} live={live} currentUserId={currentUserId} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
