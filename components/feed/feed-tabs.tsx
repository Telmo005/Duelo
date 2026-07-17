"use client";

import { useState } from "react";
import { DuelFeed } from "./duel-feed";
import { MatchCatalog, type CatalogMatch } from "./match-catalog";
import type { Duel } from "./duel-post";

const TABS = [
  { key: "apostas", label: "Apostas" },
  { key: "jogos", label: "Jogos" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Top-level split between "what's already in play" (real duels — open,
 * matched, live) and "what I could bet on" (the match catalogue). Browsing
 * jogos and creating a bet used to be two clicks removed from the feed
 * (Criar aposta → pick from a list); this puts the list itself in the feed,
 * grouped/searchable, and one tap away from bet creation with the match
 * already chosen.
 */
export function FeedTabs({
  duels,
  matches,
  live,
  currentUserId,
  emptyFeed,
}: {
  duels: Duel[];
  matches: CatalogMatch[];
  live?: boolean;
  currentUserId?: string;
  emptyFeed: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("apostas");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-5 border-b border-border">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={isActive}
              className={`press relative pb-2 text-[13px] font-semibold transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden />}
            </button>
          );
        })}
      </div>

      {tab === "apostas" ? (
        duels.length === 0 ? (
          emptyFeed
        ) : (
          <DuelFeed duels={duels} live={live} currentUserId={currentUserId} />
        )
      ) : (
        <MatchCatalog matches={matches} />
      )}
    </div>
  );
}
