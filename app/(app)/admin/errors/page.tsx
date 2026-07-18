import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/admin";
import { getRecentErrors } from "@/lib/errorLog";
import { getWalletBalance } from "@/lib/wallet";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { ClearErrorsButton } from "@/components/admin/clear-errors-button";
import { MOZAMBIQUE_TIMEZONE } from "@/lib/format";

export const metadata: Metadata = { title: "Erros | Duelo" };

/** Source labels shown as small badges — kept in sync by hand with the
 *  `source` string each logError() call site passes (see lib/errorLog.ts
 *  call sites across app/api/webhooks, app/api/cron, lib/actions/auth.ts,
 *  etc). An unrecognised source still renders fine (falls back to the raw
 *  string), so a new call site never needs this list touched to show up. */
const SOURCE_LABELS: Record<string, string> = {
  webhook_paygate: "Webhook PayGate",
  cron_reconcile_deposits: "Cron · Reconciliar depósitos",
  cron_settle_matches: "Cron · Liquidar jogos",
  cron_refund_expired_bets: "Cron · Reembolsar expiradas",
  cron_update_live_scores: "Cron · Placar ao vivo",
  cron_import_fixtures: "Cron · Importar jogos",
  auth_rate_limit: "Login/registo · rate limit",
  auth_callback: "Login · callback",
  admin_audit_log: "Auditoria admin",
  realtime_broadcast: "Realtime",
  client_error_boundary: "Erro no browser",
};

/**
 * View of error_log (see lib/errorLog.ts) — the durable trail for failures
 * that used to only reach console.error (Vercel's ephemeral function logs,
 * nobody watching them at 3am). "Limpar erros" (clearErrorsAction) wipes the
 * table once the admin's read/investigated the current backlog, so new
 * failures don't get buried under old, already-handled ones.
 */
export default async function AdminErrorsPage() {
  const profile = await requireAdmin();
  const [errors, { availableCents }] = await Promise.all([getRecentErrors(100), getWalletBalance(profile.id)]);

  return (
    <AppShell active="feed" displayName={profile.displayName} availableCents={availableCents} currentUserId={profile.id}>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Erros recentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Falhas do servidor persistidas automaticamente — webhooks, crons, login, erros no browser.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {errors.length > 0 && <ClearErrorsButton />}
          <Link href="/admin" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-accent">
            ← Admin
            <LinkPendingSpinner />
          </Link>
        </div>
      </div>

      {errors.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Nenhum erro registado — sinal de que está tudo a correr bem.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-destructive-30 bg-card">
          {errors.map((e) => (
            <div key={e.id} className="flex flex-col gap-1 border-b border-border p-3.5 text-sm last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className="w-fit rounded-full bg-destructive-10 px-2.5 py-0.5 text-xs font-bold text-destructive">
                  {SOURCE_LABELS[e.source] ?? e.source}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "medium", timeZone: MOZAMBIQUE_TIMEZONE })}
                </span>
              </div>
              <p className="font-semibold leading-snug">{e.message}</p>
              {e.detail && (
                <p className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-snug text-muted-foreground">
                  {e.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
