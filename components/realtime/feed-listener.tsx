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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, currentUserId]);

  return null;
}
