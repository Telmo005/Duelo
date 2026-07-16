"use client";

import { useState } from "react";
import { CheckCheck, LayoutGrid } from "lucide-react";
import { DuelPost, type Duel } from "./duel-post";

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
        <div className="flex flex-col gap-1.5">
          {filtered.map((duel) => (
            <DuelPost key={duel.id} duel={duel} live={live} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  );
}
