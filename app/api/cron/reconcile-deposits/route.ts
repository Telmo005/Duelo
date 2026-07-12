import { NextResponse } from "next/server";
import { reconcileStuckDeposits } from "@/lib/deposit-reconcile";

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
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcileStuckDeposits();
  return NextResponse.json(result);
}
