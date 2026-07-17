"use client";

import { useRef, useState } from "react";
import { DuelFeed } from "./duel-feed";
import { MatchCatalog, type CatalogMatch } from "./match-catalog";
import type { Duel } from "./duel-post";

const TABS = [
  { key: "apostas", label: "Apostas" },
  { key: "jogos", label: "Jogos" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Minimum horizontal travel, and how much more horizontal than vertical it
// has to be, before a touch gesture counts as "swipe to change tab" rather
// than an ordinary vertical page scroll or a diagonal thumb wobble.
const SWIPE_MIN_PX = 60;
const SWIPE_DIRECTION_RATIO = 1.5;

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
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    // Elements that scroll horizontally on their own (the status-filter
    // chip strip inside DuelFeed, tagged data-no-swipe) own their own
    // gestures — bail out so dragging through the chips never gets
    // reinterpreted as a tab switch.
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) {
      touchStart.current = null;
      return;
    }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return;

    const currentIndex = TABS.findIndex((t) => t.key === tab);
    // Swipe left (dx < 0) advances to the next tab, swipe right goes back —
    // matches the natural "drag content leftward to see what's next" feel.
    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    const next = TABS[nextIndex];
    if (next) setTab(next.key);
  }

  return (
    <div className="flex flex-col gap-3" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
