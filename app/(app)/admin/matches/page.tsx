import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SettleMatchRow } from "@/components/admin/settle-match-row";
import { ProcessedMatchRow } from "@/components/admin/processed-match-row";
import { RefundExpiredBetsButton } from "@/components/admin/refund-expired-bets-button";
import { AddMatchForm } from "@/components/admin/add-match-form";
import { ImportFixturesButton } from "@/components/admin/import-fixtures-button";
import { RefreshLiveMatchesButton } from "@/components/admin/refresh-live-matches-button";
import { getUnsettledMatches, getProcessedMatches } from "@/lib/bets";
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
  const [unsettled, processed, { availableCents }] = await Promise.all([
    getUnsettledMatches(),
    getProcessedMatches(),
    getWalletBalance(profile.id),
  ]);

  // getUnsettledMatches already orders oldest-kickoff-first. 'needs_review'
  // and 'live' are grouped into one combined "Ao vivo" bucket — both are
  // "this match is happening or just happened, not settled yet" from the
  // admin's point of view — needs_review first within it since those are
  // the most overdue (already past 90 minutes), so the whole list reads as
  // one clear priority order: everything live, then scheduled soonest-first.
  const needsReview = unsettled.filter((m) => m.matchStatus === "needs_review");
  const live = unsettled.filter((m) => m.matchStatus === "live");
  const inProgress = [...needsReview, ...live];
  const scheduled = unsettled.filter((m) => m.matchStatus === "scheduled");

  return (
    <AppShell active="feed" displayName={profile.displayName} availableCents={availableCents} currentUserId={profile.id}>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Liquidar jogos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Insere o resultado oficial para pagar o vencedor automaticamente, ou marca o jogo como adiado/abandonado para reembolsar ambos os lados.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ImportFixturesButton />
          <RefreshLiveMatchesButton />
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

      {inProgress.length > 0 && (
        <section className="mb-7">
          <h2 className={`mb-3 text-xs font-bold uppercase tracking-wider ${needsReview.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            Ao vivo ({inProgress.length})
            {needsReview.length > 0 && ` — ${needsReview.length} precisa${needsReview.length > 1 ? "m" : ""} de liquidação`}
          </h2>
          <div className={`overflow-hidden rounded-2xl border bg-card ${needsReview.length > 0 ? "border-destructive/30" : "border-border"}`}>
            {inProgress.map((match) => (
              <SettleMatchRow key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Agendado ({scheduled.length})</h2>
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Não há jogos agendados.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {scheduled.map((match) => (
              <SettleMatchRow key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>

      {processed.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Jogos processados</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {processed.map((match) => (
              <ProcessedMatchRow key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
