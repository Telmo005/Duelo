"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWalletLedger, type WalletLedgerPage } from "@/lib/wallet";

/** Fetches the next page of the caller's OWN wallet ledger — userId always
 *  comes from the authenticated session, never from the client, so there's
 *  no way to page through someone else's transactions by guessing a cursor. */
export async function getMoreWalletLedgerAction(cursor: string): Promise<WalletLedgerPage> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return getWalletLedger(user.id, { cursor });
}
