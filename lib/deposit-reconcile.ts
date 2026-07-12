import { createServiceClient } from "@/lib/supabase/server";
import { PayGateClient } from "@/lib/paygate-client";

export type ReconcileResult = { checked: number; credited: number; markedFailed: number };

/**
 * Polls PayGate directly (GET /charges/:id) for any deposit our own webhook
 * never resolved to a final state — the reconciliation safety net every
 * mobile-money integration needs, since a webhook delivery can simply be
 * lost (network blip, PayGate outage) with no retry ever reaching us.
 *
 * Also re-checks recently 'failed' deposits, not just 'pending' ones: M-Pesa/
 * e-Mola can report a timeout/error to PayGate and still complete the debit
 * moments later, so a deposit we marked 'failed' can still turn out to have
 * actually succeeded on PayGate's side. wallet_credit is idempotent per
 * (user_id, reference), so re-crediting an already-credited deposit is safe
 * — this can only ever add a missing credit, never duplicate one.
 *
 * Bounded to the last 7 days so this doesn't grow into an unbounded scan of
 * ancient genuinely-dead charges.
 */
export async function reconcileStuckDeposits(): Promise<ReconcileResult> {
  const service = createServiceClient();
  const client = new PayGateClient();

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stuck, error } = await service
    .from("deposits")
    .select("*")
    .in("status", ["pending", "failed"])
    .not("gateway_payment_id", "is", null)
    .gte("created_at", since);

  if (error) {
    console.error("reconcileStuckDeposits: failed to list deposits", error);
    return { checked: 0, credited: 0, markedFailed: 0 };
  }

  let credited = 0;
  let markedFailed = 0;

  for (const deposit of stuck ?? []) {
    let remote;
    try {
      remote = await client.getCharge(deposit.gateway_payment_id);
    } catch (err) {
      console.error("reconcileStuckDeposits: getCharge failed for", deposit.id, err);
      continue;
    }

    if (remote.status === "success") {
      const { error: creditError } = await service.rpc("wallet_credit", {
        p_user_id: deposit.user_id,
        p_amount_cents: deposit.amount_cents,
        p_type: "deposit",
        p_reference: deposit.reference,
        p_description: `Depósito via ${deposit.method === "mpesa" ? "M-Pesa" : "e-Mola"}`,
      });

      if (creditError) {
        console.error("reconcileStuckDeposits: wallet_credit failed for", deposit.id, creditError);
        continue;
      }

      await service
        .from("deposits")
        .update({ status: "success", confirmed_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .neq("status", "success");
      credited++;
    } else if (remote.status === "failed" && deposit.status === "pending") {
      await service.from("deposits").update({ status: "failed" }).eq("id", deposit.id).eq("status", "pending");
      markedFailed++;
    }
  }

  return { checked: stuck?.length ?? 0, credited, markedFailed };
}
