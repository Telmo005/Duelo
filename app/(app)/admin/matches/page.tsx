import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SettleMatchRow } from "@/components/admin/settle-match-row";
import { RefundExpiredBetsButton } from "@/components/admin/refund-expired-bets-button";
import { AddMatchForm } from "@/components/admin/add-match-form";
import { ImportFixturesButton } from "@/components/admin/import-fixtures-button";
import { getUnsettledMatches } from "@/lib/bets";
import { requireAdmin } from "@/lib/admin";
import { getWalletBalance } from "@/lib/wallet";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

export const metadata: Metadata = { title: "Liquidar jogos | Duelo" };

/**
 * Manual settlement worklist — the SETL-01 fallback for fixtures no
 * automated provider covers, and the tool used to exercise
 * bet_settle_match / bet_void_match without waiting on a real match to
 * finish.
 */
export default async function AdminMatchesPage() {
  const profile = await requireAdmin();
  const [unsettled, { availableCents }] = await Promise.all([
    getUnsettledMatches(),
    getWalletBalance(profile.id),
  ]);

  return (
    <AppShell active="feed" displayName={profile.displayName} availableCents={availableCents} currentUserId={profile.id}>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Liquidar jogos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Insere o resultado oficial para pagar o vencedor automaticamente, ou marca o jogo como adiado/abandonado para reembolsar ambos os lados.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ImportFixturesButton />
          <RefundExpiredBetsButton />
          <Link href="/admin" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-accent">
            ← Admin
            <LinkPendingSpinner />
          </Link>
        </div>
      </div>

      <section className="mb-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Adicionar jogo</h2>
        <AddMatchForm />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Por liquidar</h2>
        {unsettled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Não há jogos por liquidar.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {unsettled.map((match) => (
              <SettleMatchRow key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
