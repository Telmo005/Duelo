"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { depositSchema } from "@/lib/validation/deposit";
import { PayGateClient } from "@/lib/paygate-client";
import { logError } from "@/lib/errorLog";
import { normalizePhone } from "@/lib/phone";

type ActionResult = {
  error?: string;
  depositId?: string;
  checkoutUrl?: string;
  /** Preenchido só quando mpesa já confirma (falha ou sucesso) na própria
   *  resposta de createCharge — evita esperar 3 minutos de polling por um
   *  resultado que já se sabe. */
  immediateStatus?: "success" | "failed";
  /** Motivo devolvido pelo gateway (ex.: "Saldo insuficiente"), só relevante
   *  junto de immediateStatus === "failed". */
  message?: string | null;
};

/**
 * createDepositAction — starts a deposit. Inserts a 'pending' deposits row
 * (our own idempotency reference), then asks PayGate to create the charge.
 * The actual wallet credit happens later, in app/api/webhooks/paygate/route.ts,
 * once PayGate confirms the payment — never here (the user hasn't paid yet
 * at this point). mpesa/emola/mkesh confirm on the payer's own phone, with no
 * redirect (mpesa's result can even arrive synchronously in createCharge's own
 * response — see immediateStatus). visa_mastercard exists in the PayGate
 * client but isn't offered here yet: it needs payer_email, and profiles.email
 * is null for every phone+password signup (the only reachable flow today) —
 * see lib/validation/deposit.ts.
 */
export async function createDepositAction(input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const service = createServiceClient();

  // payer_name/payer_email vêm sempre do perfil (já recolhidos e verificados
  // no signup) — mas payer_phone já NÃO vem do perfil: o número registado na
  // conta é só a identidade de login, pode ser de uma operadora diferente da
  // carteira móvel escolhida aqui (ex.: conta registada com número Movitel a
  // pagar via M-Pesa/Vodacom). O número que efectivamente vai pagar é agora
  // um campo próprio do formulário (ver lib/validation/deposit.ts), validado
  // contra o prefixo real do método escolhido.
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("email, display_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    await logError("deposit_create", profileError, { userId: user.id, stage: "load_profile" });
    return { error: "Falha ao carregar o teu perfil. Tenta novamente." };
  }

  const payerPhone = normalizePhone(parsed.data.phone);
  const amountCents = Math.round(parsed.data.amountMt * 100);
  const reference = `DUE-DEP-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const { data: deposit, error: insertError } = await service
    .from("deposits")
    .insert({
      user_id: user.id,
      amount_cents: amountCents,
      method: parsed.data.method,
      reference,
    })
    .select("id")
    .single();

  if (insertError || !deposit) {
    await logError("deposit_create", insertError, { userId: user.id, reference, stage: "insert_deposit" });
    return { error: "Falha ao registar depósito. Tenta novamente." };
  }

  const client = new PayGateClient();

  try {
    const charge = await client.createCharge({
      reference,
      amount: parsed.data.amountMt,
      method: parsed.data.method,
      currency: "MZN",
      description: "Depósito DueloBet",
      returnUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/wallet/deposit`
        : undefined,
      payerPhone,
      payerName: profile.display_name,
      payerEmail: profile.email ?? undefined,
    });

    await service
      .from("deposits")
      .update({
        gateway_payment_id: charge.gatewayPaymentId,
        checkout_url: charge.checkoutUrl,
      })
      .eq("id", deposit.id);

    // mpesa pode devolver o resultado já aqui (síncrono). NÃO escrevemos
    // deposits.status/wallet_credit a partir daqui — isso continua a ser
    // exclusivo do webhook (app/api/webhooks/paygate/route.ts), que chega
    // quase de imediato mesmo neste caso (o gateway dispara o fan-out antes
    // de responder). immediateStatus é só uma dica de UI para não mostrar
    // "a aguardar" quando já se sabe que falhou.
    return {
      depositId: deposit.id,
      checkoutUrl: charge.checkoutUrl ?? undefined,
      immediateStatus: charge.status === "success" || charge.status === "failed" ? charge.status : undefined,
      message: charge.status === "failed" ? charge.message : undefined,
    };
  } catch (e) {
    await service
      .from("deposits")
      .update({
        status: "failed",
        failure_reason: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
      })
      .eq("id", deposit.id);

    await logError("deposit_create", e, { depositId: deposit.id, userId: user.id, reference, stage: "create_charge" });

    return { error: "Falha ao iniciar pagamento. Tenta novamente." };
  }
}
