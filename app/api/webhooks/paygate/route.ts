import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PayGateClient, type PayGateWebhook } from "@/lib/paygate-client";

/**
 * Receives fan-out events from the PayGate gateway (mpesa/emola via
 * PaySuite, but Duelo never talks to PaySuite directly — see
 * lib/paygate-client.ts). No user session — the request comes from
 * PayGate, not a logged-in browser — trust comes entirely from the HMAC
 * signature (X-Paygate-Signature), same pattern as the bet_* RPC guard:
 * this route's only job is to flip `deposits.status` and, on success,
 * call wallet_credit() to actually move the money.
 *
 * Idempotency: the conditional UPDATE (`.eq('status', 'pending')`) below
 * only succeeds for the FIRST webhook delivery for a given deposit —
 * PayGate retries up to 8 times on failure, and this guard is what stops
 * a retry (or a duplicate delivery) from crediting the wallet twice.
 * wallet_credit() is called only when that flip actually happened.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paygate-signature");

  const client = new PayGateClient();
  if (!client.verifyWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: PayGateWebhook;
  try {
    event = JSON.parse(rawBody);
    if (event.type !== "payment.success" && event.type !== "payment.failed") {
      throw new Error(`unknown event type: ${event.type}`);
    }
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: deposit } = await service
    .from("deposits")
    .select("*")
    .eq("gateway_payment_id", event.data.gateway_payment_id)
    .maybeSingle();

  if (!deposit) {
    // Ack anyway — nothing on our side will ever match this, and PayGate
    // would otherwise keep retrying it for hours.
    return NextResponse.json({ received: true, matched: false });
  }

  if (event.type === "payment.success") {
    const { data: updated } = await service
      .from("deposits")
      .update({ status: "success", confirmed_at: new Date().toISOString() })
      .eq("id", deposit.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (updated) {
      const { error: creditError } = await service.rpc("wallet_credit", {
        p_user_id: updated.user_id,
        p_amount_cents: updated.amount_cents,
        p_type: "deposit",
        p_reference: updated.reference,
        p_description: `Depósito via ${updated.method === "mpesa" ? "M-Pesa" : "e-Mola"}`,
      });

      if (creditError) {
        // The deposit is already flagged 'success' at this point (that flip
        // is what makes this handler idempotent against PayGate's retries),
        // so a failure here can't be recovered by simply retrying the
        // webhook — it needs manual reconciliation. Logged loudly so it
        // shows up in Vercel's function logs.
        console.error("wallet_credit failed for deposit", updated.id, creditError);
      }
    }
  } else {
    await service
      .from("deposits")
      .update({ status: "failed" })
      .eq("id", deposit.id)
      .eq("status", "pending");
  }

  return NextResponse.json({ received: true });
}
