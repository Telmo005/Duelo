"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";
import { reconcileStuckDeposits } from "@/lib/deposit-reconcile";

/** Manual trigger for reconcileStuckDeposits() — the deposit-reconciliation
 *  equivalent of the "Reembolsar sem adversário" button: use it if the
 *  external cron isn't configured yet, or to force a pass without waiting. */
export async function reconcileDepositsAction() {
  const admin = await requireAdmin();

  const result = await reconcileStuckDeposits();

  if (result.credited > 0 || result.markedFailed > 0) {
    await logAdminAction(
      admin.id,
      "reconcile_deposits",
      null,
      `${result.credited} depósito(s) creditado(s), ${result.markedFailed} marcado(s) como falhado(s) (${result.checked} verificados)`
    );
  }

  revalidatePath("/admin");
  return result;
}
