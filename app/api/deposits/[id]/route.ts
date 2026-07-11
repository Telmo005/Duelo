import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Polled by the deposit page while waiting for the PayGate webhook to
 * confirm payment (see components/wallet/deposit-form.tsx). Scoped to
 * the authenticated user so nobody can probe another user's deposit status.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [deposit] = await db
    .select({ status: deposits.status, amountCents: deposits.amountCents })
    .from(deposits)
    .where(and(eq(deposits.id, id), eq(deposits.userId, user.id)))
    .limit(1);

  if (!deposit) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ status: deposit.status, amountCents: deposit.amountCents });
}
