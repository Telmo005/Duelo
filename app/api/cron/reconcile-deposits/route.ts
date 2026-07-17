import { NextResponse } from "next/server";
import { reconcileStuckDeposits } from "@/lib/deposit-reconcile";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";

/**
 * Reconciliation safety net for the deposit webhook — see
 * lib/deposit-reconcile.ts for why this exists. Same Vercel Cron /
 * CRON_SECRET pattern as the other cron routes: Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` on scheduled invocations, so this
 * route rejects anything else.
 *
 * Local dev has no cron runner: call this route manually while iterating
 * (e.g. `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/reconcile-deposits`).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reconcileStuckDeposits();
    return NextResponse.json(result);
  } catch (err) {
    // reconcileStuckDeposits already logs its own per-item failures — this
    // only catches something escaping the function entirely (e.g. the
    // initial deposits query itself throwing instead of returning `error`).
    await logError("cron_reconcile_deposits", err, { stage: "top_level" });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
