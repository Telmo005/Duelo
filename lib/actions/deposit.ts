"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { depositSchema } from "@/lib/validation/deposit";
import { normalizePhone } from "@/lib/phone";
import { PayGateClient } from "@/lib/paygate-client";

type ActionResult = { error?: string; depositId?: string; checkoutUrl?: string };

/**
 * createDepositAction — starts a deposit. Inserts a 'pending' deposits row
 * (our own idempotency reference), then asks PayGate to create the charge.
 * The actual wallet credit happens later, in app/api/webhooks/paygate/route.ts,
 * once PayGate confirms the payment — never here (the user hasn't paid yet
 * at this point, they're about to be redirected to the checkout page).
 */
export async function createDepositAction(input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const amountCents = Math.round(parsed.data.amountMt * 100);
  const phone = normalizePhone(parsed.data.phone);
  const reference = `DUE-DEP-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const service = createServiceClient();

  const { data: deposit, error: insertError } = await service
    .from("deposits")
    .insert({
      user_id: user.id,
      amount_cents: amountCents,
      method: parsed.data.method,
      phone,
      reference,
    })
    .select("id")
    .single();

  if (insertError || !deposit) {
    return { error: "Falha ao registar depósito. Tenta novamente." };
  }

  const client = new PayGateClient();

  try {
    const charge = await client.createCharge({
      reference,
      amount: parsed.data.amountMt,
      method: parsed.data.method,
      currency: "MZN",
      description: "Depósito Duelo",
      returnUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/wallet/deposit`
        : undefined,
    });

    await service
      .from("deposits")
      .update({
        gateway_payment_id: charge.gatewayPaymentId,
        checkout_url: charge.checkoutUrl,
      })
      .eq("id", deposit.id);

    return { depositId: deposit.id, checkoutUrl: charge.checkoutUrl ?? undefined };
  } catch (e) {
    await service
      .from("deposits")
      .update({
        status: "failed",
        failure_reason: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
      })
      .eq("id", deposit.id);

    return { error: "Falha ao iniciar pagamento. Tenta novamente." };
  }
}
