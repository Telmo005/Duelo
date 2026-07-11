import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { CreateBetForm } from "@/components/bets/create-bet-form";
import { getUpcomingMatches } from "@/lib/bets";
import { getWalletBalance } from "@/lib/wallet";
import { BackLink } from "@/components/ui/back-link";
import { CalendarX } from "lucide-react";

export const metadata: Metadata = { title: "Nova aposta | Duelo" };

export default async function NewBetPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const [matches, { availableCents }] = await Promise.all([
    getUpcomingMatches(),
    getWalletBalance(user.id),
  ]);
  const matchOptions = matches.map((m) => ({
    id: m.id,
    home: m.home,
    away: m.away,
    league: m.league,
    kickoffLabel: new Date(m.kickoffAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    homeLogoUrl: m.homeLogoUrl,
    awayLogoUrl: m.awayLogoUrl,
  }));

  return (
    <AppShell active="bets" displayName={profile.displayName} availableCents={availableCents} currentUserId={user.id}>
      <BackLink href="/bets" label="Minhas Apostas" className="mb-5" />

      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Cria uma aposta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Escolhe o jogo, a tua previsão e o valor. Fica em custódia até haver um vencedor.</p>
      </div>

      <div className="max-w-lg">
        {matchOptions.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 py-12 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
              <CalendarX className="size-7" />
            </div>
            <p className="mb-2 text-base font-bold">Sem jogos disponíveis</p>
            <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">
              Não há jogos abertos para apostar de momento. Volta mais tarde.
            </p>
          </div>
        ) : (
          <CreateBetForm matches={matchOptions} />
        )}
      </div>
    </AppShell>
  );
}
