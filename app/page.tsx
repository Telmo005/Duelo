import type { Metadata } from "next";
import Link from "next/link";
import { Swords, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SiteHeader } from "@/components/layout/site-header";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { FeedSidebarLeft } from "@/components/layout/feed-sidebar-left";
import { FeedSidebarRight } from "@/components/layout/feed-sidebar-right";
import { FeedTabs } from "@/components/feed/feed-tabs";
import { RecentWinners } from "@/components/feed/recent-winners";
import { FeedListener } from "@/components/realtime/feed-listener";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { getFeedDuels, getRecentWinners, getUpcomingMatches } from "@/lib/bets";
import { getWalletBalance } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "Duelo — Apostas P2P entre pessoas reais",
  description: "Explora apostas criadas por outros utilizadores e entra no duelo. Custódia segura, liquidação automática.",
};

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  // The feed is real for everyone. getFeedDuels() is a public read of open
  // duels (waiting/matched) — no mock data, ever. Logged-out visitors see the
  // same real activity; only the action buttons differ (accept vs. register).
  const [duels, winners, upcomingMatches, profileAndWallet] = await Promise.all([
    getFeedDuels(),
    getRecentWinners(),
    getUpcomingMatches(),
    user
      ? Promise.all([
          db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1).then((r) => r[0]),
          getWalletBalance(user.id),
        ])
      : Promise.resolve(null),
  ]);

  const displayName = profileAndWallet?.[0]?.displayName;
  const availableCents = profileAndWallet?.[1]?.availableCents;

  const totalInPlay = duels.reduce((s, d) => s + d.stake * (d.b ? 2 : 1), 0);
  const openCount = duels.filter((d) => d.status === "locked" || d.status === "waiting").length;

  const catalogMatches = upcomingMatches.map((m) => ({
    id: m.id,
    home: m.home,
    away: m.away,
    league: m.league,
    kickoffLabel: new Date(m.kickoffAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    kickoffAtIso: new Date(m.kickoffAt).toISOString(),
    homeLogoUrl: m.homeLogoUrl,
    awayLogoUrl: m.awayLogoUrl,
    isElimination: m.isElimination,
  }));

  return (
    <div className="min-h-screen bg-background">
      {loggedIn && <FeedListener currentUserId={user?.id} />}
      <SiteHeader displayName={displayName} availableCents={availableCents} />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)_300px] lg:py-6">
        <FeedSidebarLeft openCount={openCount} potTotal={`MT ${(totalInPlay / 1000).toFixed(1)}k`} loggedIn={loggedIn} />

        <main id="feed" className="flex min-w-0 flex-col gap-4 pb-24 lg:pb-0">
          <RecentWinners winners={winners} />
          <FeedTabs
            duels={duels}
            matches={catalogMatches}
            live={loggedIn}
            currentUserId={user?.id}
            emptyFeed={<EmptyFeed loggedIn={loggedIn} />}
          />
        </main>

        <FeedSidebarRight loggedIn={loggedIn} />
      </div>

      <MobileTabBar active="feed" loggedIn={loggedIn} />
    </div>
  );
}

/** Shown when there are genuinely no open duels yet — an honest, inviting
 *  empty state (never fake activity). */
function EmptyFeed({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-10 text-primary" aria-hidden>
        <Swords className="size-7" />
      </div>
      <p className="mb-1.5 text-lg font-extrabold">Ainda não há duelos abertos</p>
      <p className="mb-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Sê o primeiro a lançar um desafio. Escolhe um jogo, a tua previsão e o valor — alguém aceita do outro lado.
      </p>
      <Link
        href={loggedIn ? "/bets/new" : "/register"}
        className="press inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-[15px] font-extrabold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary-90"
      >
        <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
        {loggedIn ? "Criar o primeiro duelo" : "Criar conta e começar"}
        <LinkPendingSpinner />
      </Link>
    </div>
  );
}
