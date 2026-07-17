import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBetReceipt } from "@/lib/bets";
import { BetReceiptCard } from "@/components/bets/bet-receipt-card";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const bet = await getBetReceipt(id);
  if (!bet) return { title: "Aposta não encontrada | Duelo" };

  // Framed as a challenge invitation only while there's an actual challenge
  // to accept ('waiting') — the whole reason this page gets shared is
  // "venha aceitar o meu desafio", so the link preview itself should read
  // that way instead of a neutral match-result statement. Once matched/
  // settled/etc. there's nothing left to accept, so it reverts to plain
  // match info. Leads with the brand name and drops the lone "⚔️ desafiou-
  // te!" urgency framing — personalized-but-calm reads as a real app on
  // WhatsApp; personalized-and-urgent reads as a scam link.
  //
  // The description deliberately does NOT lead with a currency amount — a
  // raw "1000 MT" as the first thing someone reads in a WhatsApp preview is
  // exactly what a scam/prize-notification link looks like. It explains
  // what Duelo actually is instead (1x1 between two people, not a betting
  // house), which is context a stranger receiving the link doesn't have
  // yet — the stake amount is right there once they open it, no need to
  // shout it in the preview.
  const title =
    bet.status === "waiting"
      ? `Duelo — ${bet.creator.name} desafia-te: ${bet.predictionLabel}`
      : `Duelo — ${bet.match.home} vs ${bet.match.away} — ${bet.predictionLabel}`;
  const description =
    bet.status === "waiting"
      ? `Duelo — apostas 1x1 entre amigos, sem casa a ganhar. ${bet.creator.name} desafiou-te em ${bet.match.league}: ${bet.predictionLabel}. Aceita o desafio.`
      : `Duelo — apostas 1x1 entre amigos, sem casa a ganhar. ${bet.match.home} vs ${bet.match.away} · ${bet.match.league}.`;

  // The og:image / twitter:image tags themselves are generated automatically
  // by the sibling opengraph-image.tsx file convention — no need to point at
  // it manually here (and doing so risks a stale URL missing Next's cache-
  // busting hash). Only title/description/card type belong in this object.
  //
  // A page-level `openGraph`/`twitter` object here REPLACES the root
  // layout's (Next doesn't deep-merge nested metadata objects), so
  // siteName/locale/url have to be repeated — otherwise WhatsApp's preview
  // for this specific page loses the "Duelo" branding the root layout
  // already sets for every other page.
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Duelo",
      locale: "pt_MZ",
      url: `/d/${bet.reference}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BetReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bet = await getBetReceipt(id);
  if (!bet) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-6 sm:py-10">
      <Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft className="size-4" strokeWidth={2.2} aria-hidden />
        Duelo
      </Link>

      <BetReceiptCard bet={bet} viewerId={user?.id} loggedIn={!!user} />
    </div>
  );
}
