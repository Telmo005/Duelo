"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";
import { withdrawalSchema } from "@/lib/validation/withdrawal";
import { normalizePhone } from "@/lib/phone";

type ActionResult = { error?: string };

/** Turns the raw exceptions raised inside withdrawal_request into the
 *  friendly messages a user should actually see. */
function friendlyWithdrawalError(message: string): string {
  if (message.includes("insufficient available balance")) {
    return "Saldo insuficiente para este levantamento.";
  }
  if (message.includes("already have a pending withdrawal")) {
    return "Já tens um levantamento pendente. Aguarda que seja processado antes de pedires outro.";
  }
  return "Não foi possível pedir o levantamento. Tenta novamente.";
}

/**
 * createWithdrawalAction — locks the requested amount out of the user's
 * available balance and creates a 'pending' request in one atomic step
 * (withdrawal_request, see supabase/migrations/0017_withdrawals.sql). An
 * admin processes it by hand from here — there is no automated payout.
 */
export async function createWithdrawalAction(input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = withdrawalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const amountCents = Math.round(parsed.data.amountMt * 100);
  const phone = normalizePhone(parsed.data.phone);

  const service = createServiceClient();
  const { error } = await service.rpc("withdrawal_request", {
    p_user_id: user.id,
    p_amount_cents: amountCents,
    p_method: parsed.data.method,
    p_phone: phone,
    p_recipient_name: parsed.data.recipientName,
  });

  if (error) {
    return { error: friendlyWithdrawalError(error.message) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/wallet/withdraw");
  return {};
}

/**
 * completeWithdrawalAction — admin confirms the payout was actually sent
 * on PaySuite's dashboard. Permanently removes the locked funds (never
 * credited back to available — the money genuinely left).
 */
export async function completeWithdrawalAction(withdrawalId: string, note?: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const service = createServiceClient();
  const { error } = await service.rpc("withdrawal_complete", {
    p_withdrawal_id: withdrawalId,
    p_admin_id: admin.id,
    p_admin_note: note || null,
  });

  if (error) return { error: error.message };

  await logAdminAction(admin.id, "complete_withdrawal", null, `Levantamento ${withdrawalId} marcado como concluído`);

  revalidatePath("/admin/withdrawals");
  revalidatePath("/admin");
  return {};
}

/**
 * rejectWithdrawalAction — releases the locked funds back to the user's
 * available balance. Requires a note (withdrawal_reject enforces this too)
 * so the user has a reason when they see the rejected request.
 */
export async function rejectWithdrawalAction(withdrawalId: string, note: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (!note.trim()) {
    return { error: "Indica o motivo da rejeição." };
  }

  const service = createServiceClient();
  const { error } = await service.rpc("withdrawal_reject", {
    p_withdrawal_id: withdrawalId,
    p_admin_id: admin.id,
    p_admin_note: note,
  });

  if (error) return { error: error.message };

  await logAdminAction(admin.id, "reject_withdrawal", null, `Levantamento ${withdrawalId} rejeitado: ${note}`);

  revalidatePath("/admin/withdrawals");
  revalidatePath("/admin");
  return {};
}
