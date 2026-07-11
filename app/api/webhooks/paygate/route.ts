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
 * Idempotency: wallet_credit() is idempotent per (user_id, reference) (see
 * migration 0013 — a partial unique index on wallet_ledger(user_id,
 * reference) where type='deposit'), so we credit FIRST and only mark the
 * deposit 'success' AFTER the money is
 * safely in the wallet. A retried delivery (PayGate retries up to 8x)
 * re-runs the credit as a no-op. This ordering is deliberate: the previous
 * version flipped status to 'success' before crediting, so a failed credit
 * left a phantom 'success' deposit with no money — and the reconciliation
 * job (which only scans 'pending') never caught it.
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
    // Already fully processed (credited + marked) by an earlier delivery.
    if (deposit.status === "success") {
      return NextResponse.json({ received: true, already: true });
    }
    // A 'failed' event landed first for this charge — don't resurrect it.
    if (deposit.status === "failed") {
      console.error("payment.success after failed for deposit", deposit.id);
      return NextResponse.json({ received: true, conflict: true });
    }

    // Credit FIRST — wallet_credit is idempotent per (user_id, reference)
    // (migration 0013), so a retried webhook re-runs this as a no-op.
    const { error: creditError } = await service.rpc("wallet_credit", {
      p_user_id: deposit.user_id,
      p_amount_cents: deposit.amount_cents,
      p_type: "deposit",
      p_reference: deposit.reference,
      p_description: `Depósito via ${deposit.method === "mpesa" ? "M-Pesa" : "e-Mola"}`,
    });

    if (creditError) {
      // Leave the deposit 'pending' so a webhook retry (non-200 makes
      // PayGate retry) or the reconciliation job tries again. No phantom
      // 'success' is ever written before the money lands.
      console.error("wallet_credit failed for deposit", deposit.id, creditError);
      return NextResponse.json({ error: "credit failed" }, { status: 500 });
    }

    // Money is in — now mark success. Conditional flip stays 'pending'-scoped
    // so concurrent deliveries can't clobber a later state.
    await service
      .from("deposits")
      .update({ status: "success", confirmed_at: new Date().toISOString() })
      .eq("id", deposit.id)
      .eq("status", "pending");
  } else {
    await service
      .from("deposits")
      .update({ status: "failed" })
      .eq("id", deposit.id)
      .eq("status", "pending");
  }

  return NextResponse.json({ received: true });
}
