import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SiteHeader } from "@/components/layout/site-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { FeedSidebarLeft } from "@/components/layout/feed-sidebar-left";
import { FeedSidebarRight } from "@/components/layout/feed-sidebar-right";
import { Composer } from "@/components/feed/composer";
import { DuelFeed } from "@/components/feed/duel-feed";
import { FeedListener } from "@/components/realtime/feed-listener";
import type { Duel } from "@/components/feed/duel-post";
import { getFeedDuels } from "@/lib/bets";
import { getWalletBalance } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "Duelo — Apostas P2P entre pessoas reais",
  description: "Explora apostas criadas por outros utilizadores e entra no duelo. Custódia segura, liquidação automática.",
};

// Crest URLs from API-Football (media.api-sports.io), hot-linked — same
// source used to backfill real matches (see supabase/migrations/0005_team_logos.sql).
const logo = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`;
const CREST: Record<string, string> = {
  "Man United": logo(33),
  Arsenal: logo(42),
  Barcelona: logo(529),
  "Real Madrid": logo(541),
  PSG: logo(85),
  "Bayern Munich": logo(157),
  Liverpool: logo(40),
  Chelsea: logo(49),
  Juventus: logo(496),
  "AC Milan": logo(489),
  Dortmund: logo(165),
  Leipzig: logo(173),
};

// Mock feed — shown to logged-out visitors as a marketing preview.
// Logged-in users see the real feed (lib/bets.ts getFeedDuels).
const MOCK_FEED: Duel[] = [
  {
    id: "d001",
    a: { name: "João Massingue", avatar: "#9C98F7", city: "Maputo" },
    b: { name: "Carlos Pemba", avatar: "#F2C22A", city: "Beira" },
    match: { home: "Man United", away: "Arsenal", league: "Premier League", time: "21:00", homeLogoUrl: CREST["Man United"], awayLogoUrl: CREST["Arsenal"] },
    prediction: "Man United ganha",
    predictionCode: "1",
    stake: 500,
    status: "open",
    createdAgo: "há 12 min",
  },
  {
    id: "d002",
    a: { name: "Fátima Assane", avatar: "#34D399", city: "Nampula" },
    b: { name: "Pedro Sitoe", avatar: "#F0455B", city: "Maputo" },
    match: { home: "Barcelona", away: "Real Madrid", league: "La Liga", time: "20:00", homeLogoUrl: CREST["Barcelona"], awayLogoUrl: CREST["Real Madrid"] },
    prediction: "Empate",
    predictionCode: "X",
    stake: 1000,
    status: "live",
    createdAgo: "a decorrer",
    score: { home: 1, away: 1 },
    minute: "67'",
  },
  {
    id: "d003",
    a: { name: "Miguel Ferrão", avatar: "#F2C22A", city: "Maputo" },
    b: { name: "Ana Libombo", avatar: "#8B7CFF", city: "Tete" },
    match: { home: "PSG", away: "Bayern Munich", league: "Champions League", time: "19:45", homeLogoUrl: CREST["PSG"], awayLogoUrl: CREST["Bayern Munich"] },
    prediction: "Bayern Munich ganha",
    predictionCode: "2",
    stake: 2000,
    status: "open",
    createdAgo: "há 3 min",
  },
  {
    id: "d004",
    a: { name: "Roberto Chissano", avatar: "#34D399", city: "Inhambane" },
    b: null,
    match: { home: "Liverpool", away: "Chelsea", league: "Premier League", time: "18:30", homeLogoUrl: CREST["Liverpool"], awayLogoUrl: CREST["Chelsea"] },
    prediction: "Liverpool ganha",
    predictionCode: "1",
    stake: 750,
    status: "waiting",
    createdAgo: "há 5 min",
  },
  {
    id: "d005",
    a: { name: "Sónia Tembe", avatar: "#9C98F7", city: "Gaza" },
    b: { name: "Hélio Machava", avatar: "#F0455B", city: "Sofala" },
    match: { home: "Juventus", away: "AC Milan", league: "Serie A", time: "20:45", homeLogoUrl: CREST["Juventus"], awayLogoUrl: CREST["AC Milan"] },
    prediction: "Juventus ganha",
    predictionCode: "1",
    stake: 300,
    status: "open",
    createdAgo: "há 18 min",
  },
  {
    id: "d006",
    a: { name: "Ivo Nhantumbo", avatar: "#F2C22A", city: "Maputo" },
    b: null,
    match: { home: "Dortmund", away: "Leipzig", league: "Bundesliga", time: "17:30", homeLogoUrl: CREST["Dortmund"], awayLogoUrl: CREST["Leipzig"] },
    prediction: "Empate",
    predictionCode: "X",
    stake: 400,
    status: "waiting",
    createdAgo: "há 1 min",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  let displayName: string | undefined;
  let availableCents: number | undefined;
  let duels: Duel[];

  if (user) {
    const [profile, wallet] = await Promise.all([
      db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1).then((r) => r[0]),
      getWalletBalance(user.id),
    ]);
    displayName = profile?.displayName;
    availableCents = wallet.availableCents;
    duels = await getFeedDuels();
  } else {
    duels = MOCK_FEED;
  }

  const totalInPlay = duels.reduce((s, d) => s + d.stake * (d.b ? 2 : 1), 0);
  const openCount = duels.filter((d) => d.status === "open" || d.status === "waiting").length;

  return (
    <div className="min-h-screen bg-background">
      {loggedIn && <FeedListener currentUserId={user?.id} />}
      <SiteHeader displayName={displayName} availableCents={availableCents} />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[260px_1fr_300px] lg:py-6">
        <FeedSidebarLeft openCount={openCount} potTotal={`MT ${(totalInPlay / 1000).toFixed(1)}k`} loggedIn={loggedIn} />

        <main id="feed" className="flex flex-col gap-4 pb-20 lg:pb-0">
          <Composer href={loggedIn ? "/bets/new" : "/register"} />
          <DuelFeed duels={duels} live={loggedIn} currentUserId={user?.id} />
        </main>

        <FeedSidebarRight loggedIn={loggedIn} />
      </div>

      <BottomNav loggedIn={loggedIn} />
    </div>
  );
}
