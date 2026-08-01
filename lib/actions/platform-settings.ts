"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";

type ActionResult = { error?: string; success?: boolean };

/**
 * updatePlatformSettingsAction — admin-only control for the two rates
 * bet_settle_match reads at the top of every settlement (see migration
 * 0038_affiliate_program.sql): the house commission and the affiliate
 * share of it. Stored as basis points; only ever affects settlements from
 * this point forward — every past affiliate_ledger/platform_ledger row
 * already has its own rate baked in.
 */
export async function updatePlatformSettingsAction(commissionPct: number, referralSharePct: number): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (!Number.isFinite(commissionPct) || commissionPct < 1 || commissionPct > 50) {
    return { error: "Comissão da casa deve estar entre 1% e 50%." };
  }
  if (!Number.isFinite(referralSharePct) || referralSharePct < 0 || referralSharePct > 100) {
    return { error: "Percentagem de afiliado deve estar entre 0% e 100%." };
  }

  const commissionRateBps = Math.round(commissionPct * 100);
  const referralShareBps = Math.round(referralSharePct * 100);

  await db
    .update(platformSettings)
    .set({ commissionRateBps, referralShareBps, updatedAt: new Date() })
    .where(eq(platformSettings.id, 1));

  await logAdminAction(
    admin.id,
    "update_platform_settings",
    null,
    `Comissão da casa: ${commissionPct}% · Percentagem de afiliado: ${referralSharePct}%`
  );

  revalidatePath("/admin/afiliados");
  revalidatePath("/admin");

  return { success: true };
}
