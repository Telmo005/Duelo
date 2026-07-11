import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/admin";
import { getFinancialSummary, getFlaggedBets, getRecentBets, getWalletOverview } from "@/lib/adminData";
import { getRecentAdminActions } from "@/lib/adminAudit";
import { formatCentsAsMt, getWalletBalance } from "@/lib/wallet";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

export const metadata: Metadata = { title: "Admin | Duelo" };

const FLAG_LABELS: Record<string, string> = {
  same_device: "Mesmo dispositivo",
  same_ip: "Mesmo IP",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  waiting: { label: "Aguarda adversário", className: "bg-primary/10 text-primary" },
  matched: { label: "Aberto", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
  refunded: { label: "Reembolsada", className: "bg-locked/10 text-locked" },
  settled: { label: "Liquidada", className: "bg-success/10 text-success" },
};

const ADMIN_ACTION_LABELS: Record<string, string> = {
  password_reset: "Reposição de password",
  settle_match: "Liquidação manual",
  void_match: "Anulação de jogo",
};

export default async function AdminPage() {
  const profile = await requireAdmin();
  const [summary, flagged, recentBets, wallets, adminActions, { availableCents }] = await Promise.all([
    getFinancialSummary(),
    getFlaggedBets(),
    getRecentBets(),
    getWalletOverview(),
    getRecentAdminActions(),
    getWalletBalance(profile.id),
  ]);

  return (
    <AppShell active="feed" displayName={profile.displayName} availableCents={availableCents} currentUserId={profile.id}>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visibilidade financeira e revisão de apostas suspeitas.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/users" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-accent">
            Recuperar conta →
            <LinkPendingSpinner />
          </Link>
          <Link href="/admin/matches" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-accent">
            Liquidar jogos →
            <LinkPendingSpinner />
          </Link>
        </div>
      </div>

      {/* Financial summary */}
      <section className="mb-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Resumo financeiro</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Disponível (total)", value: formatCentsAsMt(summary.totalAvailableCents) },
            { label: "Bloqueado (total)", value: formatCentsAsMt(summary.totalLockedCents) },
            { label: "Depositado (total)", value: formatCentsAsMt(summary.totalDepositsCents) },
            { label: "Comissão ganha", value: formatCentsAsMt(summary.totalCommissionCents) },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-1 text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-extrabold tabular-nums">{s.value} <span className="text-sm text-muted-foreground">MT</span></p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
          <span>{summary.walletCount} carteiras</span>
          <span>{summary.betsWaiting} à espera</span>
          <span>{summary.betsMatched} em curso</span>
          <span>{summary.betsSettled} liquidadas</span>
        </div>
      </section>

      {/* Flagged bets */}
      <section className="mb-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Apostas sinalizadas ({flagged.length})
        </h2>
        {flagged.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhuma aposta sinalizada de momento.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-destructive/30 bg-card">
            {flagged.map((bet) => (
              <div key={bet.id} className="flex flex-col gap-1 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">
                    {bet.creatorName} vs {bet.opponentName} · {bet.matchHome} vs {bet.matchAway}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCentsAsMt(bet.stakeCents)} MT · {new Date(bet.flaggedAt!).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
                  {FLAG_LABELS[bet.flaggedReason!] ?? bet.flaggedReason}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent bets */}
      <section className="mb-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Apostas recentes</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {recentBets.map((bet) => {
            const s = STATUS_LABELS[bet.status] ?? { label: bet.status, className: "bg-muted text-muted-foreground" };
            return (
              <div key={bet.id} className="flex items-center justify-between border-b border-border p-3.5 text-sm last:border-b-0">
                <span className="truncate">
                  {bet.creatorName} {bet.opponentName ? `vs ${bet.opponentName}` : "(sem adversário)"} · {formatCentsAsMt(bet.stakeCents)} MT
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${s.className}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Wallets */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Carteiras</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {wallets.map((w) => (
            <div key={w.email} className="flex items-center justify-between border-b border-border p-3.5 text-sm last:border-b-0">
              <div>
                <p className="font-bold">{w.displayName}</p>
                <p className="text-xs text-muted-foreground">{w.email}</p>
              </div>
              <div className="text-right text-xs">
                <p><span className="text-success">{formatCentsAsMt(w.availableCents)} MT</span> disponível</p>
                <p className="text-muted-foreground">{formatCentsAsMt(w.lockedCents)} MT bloqueado</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Admin audit trail */}
      <section className="mt-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ações administrativas recentes</h2>
        {adminActions.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhuma ação administrativa registada ainda.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {adminActions.map((a) => (
              <div key={a.id} className="flex flex-col gap-0.5 border-b border-border p-3.5 text-sm last:border-b-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{ADMIN_ACTION_LABELS[a.action] ?? a.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.adminName}
                  {a.targetName ? ` → ${a.targetName}` : ""} · {a.detail}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
