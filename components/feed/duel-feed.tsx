"use client";

import { useState } from "react";
import { DuelPost, type Duel } from "./duel-post";

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "open", label: "Abertos" },
  { key: "waiting", label: "Aguardam adversário" },
  { key: "live", label: "Ao vivo" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function DuelFeed({ duels, live = false, currentUserId }: { duels: Duel[]; live?: boolean; currentUserId?: string }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = filter === "all" ? duels : duels.filter((d) => d.status === filter);
  const activeLabel = FILTERS.find((f) => f.key === filter)?.label ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={isActive}
              className={`press shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-[0_0_16px_rgba(242,194,42,0.45)]"
                  : "border border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <div className="-mt-2 flex justify-center gap-1.5" aria-hidden>
        {FILTERS.map((f) => (
          <span
            key={f.key}
            className={`h-1.5 rounded-full transition-all ${
              filter === f.key ? "w-4 bg-primary" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum duelo &ldquo;{activeLabel.toLowerCase()}&rdquo; neste momento.
        </div>
      ) : (
        filtered.map((duel) => <DuelPost key={duel.id} duel={duel} live={live} currentUserId={currentUserId} />)
      )}
    </div>
  );
}
