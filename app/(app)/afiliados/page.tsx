import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Users, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { AffiliateShareCard } from "@/components/affiliate/affiliate-share-card";
import { getAffiliateSummary, getReferredUsers } from "@/lib/affiliate";
import { getWalletBalance, formatCentsAsMt } from "@/lib/wallet";
import { MOZAMBIQUE_TIMEZONE } from "@/lib/format";

export const metadata: Metadata = { title: "Afiliados | DueloBet" };

export default async function AffiliatesPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const [summary, referred, { availableCents }] = await Promise.all([
    getAffiliateSummary(user.id),
    getReferredUsers(user.id),
    getWalletBalance(user.id),
  ]);

  return (
    <AppShell active="profile" displayName={profile.displayName} availableCents={availableCents} currentUserId={user.id}>
      <div className="mb-7">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Afiliados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recomenda a DueloBet a amigos — ganhas {summary.referralSharePct}% da comissão da casa em cada duelo que eles jogarem.
        </p>
      </div>

      <div className="mb-7">
        <AffiliateShareCard code={summary.referralCode} />
      </div>

      <section className="mb-7 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden /> Pessoas referidas
          </p>
          <p className="text-xl font-extrabold tabular-nums">{summary.referredCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gift className="size-3.5" aria-hidden /> Total ganho
          </p>
          <p className="text-xl font-extrabold tabular-nums text-success">
            {formatCentsAsMt(summary.totalEarnedCents)} <span className="text-sm text-muted-foreground">MT</span>
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pessoas que referiste</h2>
        {referred.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Ainda não referiste ninguém — partilha o teu código para começares a ganhar.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {referred.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-border p-3.5 text-sm last:border-b-0">
                <span className="font-bold">{r.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  desde {r.createdAt.toLocaleDateString("pt", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: MOZAMBIQUE_TIMEZONE })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
