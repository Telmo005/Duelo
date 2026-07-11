import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { DepositForm } from "@/components/wallet/deposit-form";
import { getWalletBalance } from "@/lib/wallet";
import { BackLink } from "@/components/ui/back-link";

export const metadata: Metadata = { title: "Depositar | Duelo" };

export default async function DepositPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const { availableCents } = await getWalletBalance(user.id);

  return (
    <AppShell active="wallet" displayName={profile.displayName} availableCents={availableCents} currentUserId={user.id}>
      <BackLink href="/dashboard" label="Carteira" className="mb-5" />

      <div className="mb-7">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Depositar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Escolhe o método e o valor. O saldo fica disponível assim que o pagamento for confirmado.</p>
      </div>

      <div className="max-w-md">
        <DepositForm />
      </div>
    </AppShell>
  );
}
