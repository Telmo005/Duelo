import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { BetsList } from "@/components/bets/bets-list";
import { getUserBets } from "@/lib/profile";
import { getWalletBalance } from "@/lib/wallet";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { Plus, Swords, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Minhas Apostas | Duelo" };

export default async function BetsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const [bets, { availableCents }] = await Promise.all([
    getUserBets(user.id),
    getWalletBalance(user.id),
  ]);

  return (
    <AppShell active="bets" displayName={profile.displayName} availableCents={availableCents} currentUserId={user.id}>
      <div className="mb-7 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Minhas Apostas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanha todos os teus duelos, do criado ao liquidado.</p>
        </div>
        <Link
          href="/bets/new"
          className="press flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
          Nova aposta
          <LinkPendingSpinner />
        </Link>
      </div>

      {bets.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
            <Swords className="size-7" />
          </div>
          <p className="mb-2 text-base font-bold">Ainda não tens apostas</p>
          <p className="mb-5 max-w-64 text-sm leading-relaxed text-muted-foreground">
            Cria a tua primeira aposta e desafia outro utilizador a apostar contra ti.
          </p>
          <Link href="/bets/new" className="press flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground">
            Criar aposta
            <ArrowRight className="size-4" aria-hidden />
            <LinkPendingSpinner />
          </Link>
        </div>
      ) : (
        <BetsList bets={bets} />
      )}
    </AppShell>
  );
}
