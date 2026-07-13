import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { WithdrawForm } from "@/components/wallet/withdraw-form";
import { getWalletBalance } from "@/lib/wallet";
import { getUserWithdrawals } from "@/lib/withdrawals";
import { formatCentsAsMt } from "@/lib/format";
import { BackLink } from "@/components/ui/back-link";

export const metadata: Metadata = { title: "Levantar | Duelo" };

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-primary-10 text-primary" },
  completed: { label: "Concluído", className: "bg-success-10 text-success" },
  rejected: { label: "Rejeitado", className: "bg-destructive-10 text-destructive" },
};

export default async function WithdrawPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const [{ availableCents }, myWithdrawals] = await Promise.all([
    getWalletBalance(user.id),
    getUserWithdrawals(user.id, 5),
  ]);

  const hasPending = myWithdrawals.some((w) => w.status === "pending");

  return (
    <AppShell active="wallet" displayName={profile.displayName} availableCents={availableCents} currentUserId={user.id}>
      <BackLink href="/dashboard" label="Carteira" className="mb-5" />

      <div className="mb-7">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Levantar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pede o levantamento do teu saldo disponível. Processado manualmente pela nossa equipa.
        </p>
      </div>

      <div className="max-w-md">
        {hasPending ? (
          <div className="rounded-2xl border border-primary-25 bg-primary-10 p-5 text-center">
            <p className="text-sm font-bold text-primary">Já tens um levantamento pendente</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Aguarda que a nossa equipa processe o pedido em curso antes de pedires outro.
            </p>
          </div>
        ) : (
          <WithdrawForm
            availableCents={availableCents}
            defaultPhone={profile.phone ?? ""}
            defaultRecipientName={profile.displayName}
          />
        )}
      </div>

      {myWithdrawals.length > 0 && (
        <section className="mt-8 max-w-md">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Últimos levantamentos</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {myWithdrawals.map((w, i) => {
              const status = STATUS_LABEL[w.status] ?? { label: w.status, className: "bg-muted text-muted-foreground" };
              return (
                <div key={w.id} className={`flex items-center justify-between gap-3 px-5 py-4 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold tabular-nums">{formatCentsAsMt(w.amountCents)} MT</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(w.createdAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })} · {w.reference}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}
