"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCheck, LayoutGrid, Flame, Lock } from "lucide-react";
import { DuelPost, type Duel } from "./duel-post";
import { TeamBadge } from "@/components/match/team-badge";
import { SectionLabel } from "@/components/ui/section-label";
import { formatCentsAsMt } from "@/lib/format";
import { groupByLeague, pickFeatured, type FeaturePriorityInfo } from "@/lib/leagueTiers";

function featuredInfo(d: Duel): FeaturePriorityInfo {
  return {
    league: d.match.league,
    country: d.match.country,
    kickoffAtIso: d.match.kickoffAtIso,
    matchStatus: d.status === "live" ? "live" : "scheduled",
    featured: d.match.featured,
  };
}

/** One spotlight card in the "Apostas" tab's own Destaques strip — same
 *  visual language as the feed's match-picker cards (bigger crests, gold
 *  glow), plus the two things that make this a bet rather than just a
 *  fixture: who called what, and what's actually at stake. Links straight
 *  to the duel's own receipt page, same as tapping the compact row would. */
function FeaturedDuelCard({ duel }: { duel: Duel }) {
  if (!duel.reference) return null;
  const isLive = duel.status === "live";
  const isMatched = duel.status === "locked" || isLive;
  return (
    <Link
      href={`/d/${duel.reference}`}
      prefetch={false}
      className="press relative flex w-[136px] shrink-0 flex-col rounded-2xl border border-primary-40 bg-card px-3 py-3 shadow-[var(--shadow-elevated)]"
    >
      <p className="truncate text-center text-[9px] font-bold uppercase tracking-wider text-primary/90">{duel.match.league}</p>
      <div className="my-2 flex items-center justify-center gap-2">
        <TeamBadge name={duel.match.home} logoUrl={duel.match.homeLogoUrl} size={30} />
        <span className="text-[9px] font-semibold text-muted-foreground">vs</span>
        <TeamBadge name={duel.match.away} logoUrl={duel.match.awayLogoUrl} size={30} />
      </div>
      <p className="line-clamp-1 text-center text-[10px] font-bold leading-tight">
        {duel.match.home} <span className="font-normal text-muted-foreground">vs</span> {duel.match.away}
      </p>
      <p className="mt-1 line-clamp-1 text-center text-[10px] font-semibold text-primary">{duel.prediction}</p>
      <div className="mt-1.5 flex items-center justify-center">
        {isLive ? (
          <span className="flex items-center gap-1 text-[10px] font-extrabold tabular-nums text-live">
            <span className="size-1.5 shrink-0 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-live" aria-hidden />
            {duel.score ? `${duel.score.home}-${duel.score.away}` : "AO VIVO"}
          </span>
        ) : isMatched ? (
          <span className="flex items-center gap-1 rounded-full bg-locked-10 px-2 py-0.5 text-[9px] font-bold text-locked">
            <Lock className="size-2.5 shrink-0" aria-hidden /> Fechado
          </span>
        ) : (
          <span className="text-[10px] font-bold text-success">MT {formatCentsAsMt(duel.stakeCents)}</span>
        )}
      </div>
    </Link>
  );
}

/** Same discovery-strip concept as the feed's "Jogos" tab and the
 *  bet-creation wizard (lib/leagueTiers.ts's pickFeatured), applied to real
 *  duels instead of bare fixtures — a match earning its spot there (league
 *  prestige, soonest kickoff, admin pin) earns the same spot here once
 *  someone's actually bet on it. Hidden while a status filter is active,
 *  same reasoning as hiding during an active search elsewhere: this is a
 *  discovery aid, not a filtered result. */
function FeaturedDuelsStrip({ duels }: { duels: Duel[] }) {
  const featured = useMemo(() => pickFeatured(duels, Date.now(), featuredInfo), [duels]);
  if (featured.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-0.5">
        <Flame className="size-3.5 text-primary" aria-hidden />
        <SectionLabel className="mb-0">Destaques</SectionLabel>
      </div>
      <div data-no-swipe className="flex gap-2.5 overflow-x-auto pb-1">
        {featured.map((d) => (
          <FeaturedDuelCard key={d.id} duel={d} />
        ))}
      </div>
    </div>
  );
}

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

export function DuelFeed({ duels, live = false, currentUserId }: { duels: Duel[]; live?: boolean; currentUserId?: string }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = filter === "all" ? duels : duels.filter((d) => d.status === filter);
  const activeLabel = FILTERS.find((f) => f.key === filter)?.label ?? "";

  // Grouped by league so a Moçambola fan isn't scrolling past a wall of
  // Champions League duels to find their game. Groups themselves are then
  // ordered by competition prestige (see lib/leagueTiers.ts — shared with
  // the admin fixture picker), not by whichever league happened to have the
  // most recent bet — recency only breaks ties within that ranking
  // (Array.sort is stable, and a Map preserves insertion order, so
  // unranked/tied leagues keep the recency order they arrived in).
  // groupByLeague also tells apart two different leagues that happen to
  // share a display name (e.g. England's and Kazakhstan's "Premier
  // League") instead of merging their duels into one section.
  const groups = useMemo(
    () => groupByLeague(filtered, (d) => ({ league: d.match.league, leagueId: d.match.leagueId, country: d.match.country })),
    [filtered]
  );

  return (
    <div className="flex flex-col gap-3">
      {filter === "all" && <FeaturedDuelsStrip duels={duels} />}

      <div data-no-swipe className="flex gap-1.5 overflow-x-auto pb-1">
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
