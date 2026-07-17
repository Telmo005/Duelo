"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { FEED_TOPIC, FEED_BROADCAST_EVENT, type FeedEvent } from "@/lib/realtime";

/**
 * Subscribes to the shared feed broadcast channel and refreshes the current
 * server-rendered page whenever something relevant happens elsewhere (a bet
 * gets accepted/cancelled, a match gets settled/voided/refunded). Mounted
 * once in AppShell so every authenticated page gets this for free.
 *
 * router.refresh() re-runs the server component data fetch for the current
 * route without a full reload — simpler than wiring TanStack Query for this,
 * and sufficient since every page here is already server-rendered.
 *
 * The broadcast channel alone isn't enough on the flaky mobile networks this
 * app targets: a dropped websocket doesn't announce itself to the UI, so a
 * user who loses signal mid-session just silently stops seeing updates until
 * they manually navigate. Three fallbacks close that gap, all converging on
 * the same router.refresh() the broadcast handler already uses — cheap and
 * idempotent, so firing it speculatively (nothing may actually have changed)
 * costs nothing beyond a re-fetch:
 *   1. Tab/app regains visibility (phone screen was off, or they switched
 *      apps and came back) — the exact moment a stale feed would be most
 *      visible and most confusing.
 *   2. Browser fires `online` again after a connectivity drop.
 *   3. The realtime channel itself reports CHANNEL_ERROR/TIMED_OUT — the
 *      subscription broke, but nothing else told the page that yet.
 */
export function FeedListener({ currentUserId }: { currentUserId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(FEED_TOPIC, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: FEED_BROADCAST_EVENT }, ({ payload }) => {
        const event = payload as FeedEvent;

        if (event.type === "bet_accepted" && event.creatorId === currentUserId) {
          toast.success("A tua aposta foi aceite!");
        }

        router.refresh();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          router.refresh();
        }
      });

    function handleVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    function handleOnline() {
      router.refresh();
    }
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("online", handleOnline);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleOnline);
    };
  }, [router, currentUserId]);

  return null;
}
