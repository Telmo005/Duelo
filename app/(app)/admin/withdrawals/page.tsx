import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { WithdrawalRow } from "@/components/admin/withdrawal-row";
import { getPendingWithdrawals } from "@/lib/withdrawals";
import { requireAdmin } from "@/lib/admin";
import { getWalletBalance } from "@/lib/wallet";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

export const metadata: Metadata = { title: "Levantamentos | Duelo" };

/**
 * Manual withdrawal worklist. Every row here already has its funds locked
 * (withdrawal_request took care of that atomically) — this page is purely
 * about the admin's own manual step: send the payout by hand on PaySuite's
 * dashboard, then come back and mark it completed (or reject it, if
 * something's wrong, which returns the funds).
 */
export default async function AdminWithdrawalsPage() {
  const profile = await requireAdmin();
  const [pending, { availableCents }] = await Promise.all([
    getPendingWithdrawals(),
    getWalletBalance(profile.id),
  ]);

  return (
    <AppShell active="feed" displayName={profile.displayName} availableCents={availableCents} currentUserId={profile.id}>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Levantamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paga manualmente na PaySuite e depois marca como concluído — o saldo já está bloqueado.
          </p>
        </div>
        <Link href="/admin" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-accent">
          ← Admin
          <LinkPendingSpinner />
        </Link>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Não há levantamentos pendentes.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {pending.map((w) => (
            <WithdrawalRow key={w.id} withdrawal={w} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
