import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBetReceipt } from "@/lib/bets";
import { BetReceiptCard } from "@/components/bets/bet-receipt-card";
import { formatCentsAsMt } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const bet = await getBetReceipt(id);
  if (!bet) return { title: "Aposta não encontrada | Duelo" };

  const title = `${bet.match.home} vs ${bet.match.away} — ${bet.predictionLabel}`;
  const description = `${formatCentsAsMt(bet.stakeCents)} MT em jogo · ${bet.match.league} · Referência ${bet.reference}. Entra no duelo na Duelo.`;

  // The og:image / twitter:image tags themselves are generated automatically
  // by the sibling opengraph-image.tsx file convention — no need to point at
  // it manually here (and doing so risks a stale URL missing Next's cache-
  // busting hash). Only title/description/card type belong in this object.
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
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
