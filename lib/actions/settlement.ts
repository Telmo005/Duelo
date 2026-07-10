"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

type ActionResult = { error?: string };

/**
 * Manual result entry. This is the fallback path research flagged for
 * fixtures no automated provider covers (e.g. Moçambola) and doubles as
 * the way to exercise bet_settle_match without waiting on a real fixture
 * to finish. Gated by requireAdmin — redirects non-admins away.
 */
export async function settleMatchAction(matchId: string, resultHome: number, resultAway: number): Promise<ActionResult> {
  await requireAdmin();

  const service = createServiceClient();
  const { error } = await service.rpc("bet_settle_match", {
    p_match_id: matchId,
    p_result_home: resultHome,
    p_result_away: resultAway,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/matches");
  revalidatePath("/admin");
  revalidatePath("/");
  return {};
}

export async function voidMatchAction(matchId: string, status: "postponed" | "abandoned"): Promise<ActionResult> {
  await requireAdmin();

  const service = createServiceClient();
  const { error } = await service.rpc("bet_void_match", { p_match_id: matchId, p_status: status });

  if (error) return { error: error.message };

  revalidatePath("/admin/matches");
  revalidatePath("/admin");
  revalidatePath("/");
  return {};
}
