"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";
import { broadcastFeedEvent } from "@/lib/realtime";

type ActionResult = { error?: string };

/**
 * Manual result entry. This is the fallback path research flagged for
 * fixtures no automated provider covers (e.g. Moçambola) and doubles as
 * the way to exercise bet_settle_match without waiting on a real fixture
 * to finish. Gated by requireAdmin — redirects non-admins away.
 */
export async function settleMatchAction(matchId: string, resultHome: number, resultAway: number): Promise<ActionResult> {
  const admin = await requireAdmin();

  const service = createServiceClient();
  const { error } = await service.rpc("bet_settle_match", {
    p_match_id: matchId,
    p_result_home: resultHome,
    p_result_away: resultAway,
  });

  if (error) return { error: error.message };

  await logAdminAction(admin.id, "settle_match", null, `Liquidação manual do jogo ${matchId}: ${resultHome}-${resultAway}`);
  await broadcastFeedEvent({ type: "bets_settled", matchId });

  revalidatePath("/admin/matches");
  revalidatePath("/admin");
  revalidatePath("/");
  return {};
}

export async function voidMatchAction(matchId: string, status: "postponed" | "abandoned"): Promise<ActionResult> {
  const admin = await requireAdmin();

  const service = createServiceClient();
  const { error } = await service.rpc("bet_void_match", { p_match_id: matchId, p_status: status });

  if (error) return { error: error.message };

  await logAdminAction(admin.id, "void_match", null, `Jogo ${matchId} marcado como ${status}`);
  await broadcastFeedEvent({ type: "bets_voided", matchId });

  revalidatePath("/admin/matches");
  revalidatePath("/admin");
  revalidatePath("/");
  return {};
}

/**
 * Manual trigger for bet_auto_refund_expired (BET-06) — refunds every
 * 'waiting' bet whose match already kicked off with no opponent found.
 * This is meant to run every few minutes via an external scheduler (see
 * app/api/cron/refund-expired-bets/route.ts — Vercel's Hobby plan cron
 * only allows once/day, so the real schedule lives in cron-job.org), so
 * this button is a manual fallback: use it if the external cron isn't
 * configured yet, or to force a refund pass without waiting for the next
 * scheduled tick.
 */
export async function refundExpiredBetsAction(): Promise<ActionResult & { refunded?: number }> {
  const admin = await requireAdmin();

  const service = createServiceClient();
  const { data, error } = await service.rpc("bet_auto_refund_expired");

  if (error) return { error: error.message };

  const refunded = typeof data === "number" ? data : 0;
  if (refunded > 0) {
    await logAdminAction(admin.id, "refund_expired_bets", null, `${refunded} aposta(s) sem adversário reembolsada(s) manualmente`);
    await broadcastFeedEvent({ type: "bets_refunded" });
  }

  revalidatePath("/admin/matches");
  revalidatePath("/bets");
  revalidatePath("/");
  return { refunded };
}
