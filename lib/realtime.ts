/**
 * Server → client push for the feed. Uses Supabase Realtime's Broadcast
 * REST endpoint (not the supabase-js channel().send() flow, which expects
 * a persistent websocket — a poor fit for one-shot server actions / route
 * handlers). Sent AFTER the underlying wallet/bet transaction has already
 * committed, per the project's realtime pattern: Broadcast is a signal
 * that something happened, never the source of truth for whether it did.
 */

export const FEED_TOPIC = "duelo:feed";
export const FEED_BROADCAST_EVENT = "feed_update";

export type FeedEvent =
  | { type: "bet_created"; matchId: string }
  | { type: "bet_accepted"; betId: string; matchId: string; creatorId: string }
  | { type: "bet_cancelled"; betId: string; matchId: string }
  | { type: "bets_settled"; matchId: string }
  | { type: "bets_voided"; matchId: string }
  | { type: "bets_refunded" };

/** Best-effort: a missed broadcast just means open clients rely on their
 *  next manual refresh/navigation. It must never throw into — or block —
 *  the caller, whose actual DB transaction has already committed. */
export async function broadcastFeedEvent(event: FeedEvent): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic: FEED_TOPIC, event: FEED_BROADCAST_EVENT, payload: event, private: false }],
      }),
    });
  } catch (err) {
    console.error("broadcastFeedEvent failed", { event, err });
  }
}
