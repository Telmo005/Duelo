import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { getWalletBalance, getWalletLedger, describeLedgerEntry, formatCentsAsMt } from "@/lib/wallet";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

export const metadata: Metadata = { title: "Carteira | Duelo" };

const LEDGER_ICON: Record<string, { icon: string; tint: string }> = {
  deposit: { icon: "📥", tint: "#34D399" },
  hold: { icon: "🔒", tint: "#94A3B8" },
  release: { icon: "↩️", tint: "#3B82F6" },
  settle_win: { icon: "🏆", tint: "#34D399" },
  settle_loss: { icon: "💔", tint: "#F0455B" },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const [{ availableCents, lockedCents }, ledger] = await Promise.all([
    getWalletBalance(user.id),
    getWalletLedger(user.id),
  ]);

  return (
    <AppShell active="wallet" displayName={profile.displayName} availableCents={availableCents}>
      <div className="mb-7">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Carteira</h1>
        <p className="mt-1 text-sm text-muted-foreground">O teu saldo, sempre em custódia segura até haver um vencedor.</p>
      </div>

      {/* Hero balance card */}
      <div
        className="relative mb-7 overflow-hidden rounded-2xl border border-primary/20 p-6"
        style={{ background: "linear-gradient(160deg, rgba(242,194,42,0.14), transparent 60%)" }}
      >
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saldo disponível</p>
        <p id="available-balance" className="mt-1.5 text-4xl font-extrabold tracking-tight tabular-nums lg:text-5xl">
          {formatCentsAsMt(availableCents)} <span className="text-xl font-semibold text-muted-foreground">MT</span>
        </p>

        {lockedCents > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden>🔒</span>
            <span id="locked-balance" className="font-bold text-foreground">{formatCentsAsMt(lockedCents)} MT</span>
            em custódia nas tuas apostas activas
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <Link
            href="/wallet/deposit"
            id="cta-deposit"
            className="press flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-extrabold tracking-tight text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90 sm:flex-initial sm:px-8"
          >
            + Depositar
            <LinkPendingSpinner />
          </Link>
          <Link
            href="/bets"
            className="press flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card/70 py-3.5 text-sm font-bold transition-colors hover:bg-accent sm:flex-initial sm:px-8"
          >
            Ver apostas
            <LinkPendingSpinner />
          </Link>
        </div>
      </div>

      {/* Transaction history */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Últimas transações
        </h2>

        {ledger.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 py-8 text-center">
            <div className="mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-muted text-2xl" aria-hidden>📊</div>
            <p className="mb-2 text-base font-bold">Ainda não há movimentos</p>
            <p className="mb-5 max-w-60 text-sm leading-relaxed text-muted-foreground">
              As tuas transações vão aparecer aqui depois do primeiro depósito.
            </p>
            <Link href="/wallet/deposit" id="history-empty-deposit-link" className="flex items-center gap-1.5 text-sm font-bold text-primary">
              Fazer primeiro depósito →
              <LinkPendingSpinner />
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {ledger.map((entry, i) => {
              const { label, netCents } = describeLedgerEntry(entry);
              const isPositive = netCents > 0;
              const meta = LEDGER_ICON[entry.type] ?? { icon: "•", tint: "#94A3B8" };
              return (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 px-5 py-4 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm"
                    style={{ background: `${meta.tint}22` }}
                    aria-hidden
                  >
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
                      {entry.description ? ` · ${entry.description}` : ""}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-extrabold tabular-nums ${isPositive ? "text-success" : "text-muted-foreground"}`}>
                    {isPositive ? "+" : ""}
                    {formatCentsAsMt(netCents)} MT
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
