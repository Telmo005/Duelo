import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcastFeedEvent } from "@/lib/realtime";

/**
 * Refunds any 'waiting' bet whose match has already kicked off with no
 * opponent found (BET-06). Wired to Vercel Cron (see vercel.json) — Vercel
 * automatically sends `Authorization: Bearer ${CRON_SECRET}` on scheduled
 * invocations, so this route rejects any request that doesn't present it
 * (otherwise anyone could hit this URL and trigger refunds directly).
 *
 * Local dev has no cron runner: call this route manually while iterating
 * (e.g. `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/refund-expired-bets`).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("bet_auto_refund_expired");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof data === "number" && data > 0) {
    await broadcastFeedEvent({ type: "bets_refunded" });
  }

  return NextResponse.json({ refunded: data });
}
