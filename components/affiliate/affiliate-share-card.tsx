"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, MessageCircle } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";

/** Card at the top of /afiliados — the user's own code plus the two share
 *  paths that actually matter here: WhatsApp (the dominant sharing channel
 *  in Mozambique) and a plain copy for anything else. Mirrors the
 *  copy/share pattern already used in bet-receipt-card.tsx. */
export function AffiliateShareCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${code}` : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  function handleWhatsapp() {
    const text = `Vem apostar comigo na DueloBet — apostas 1x1 entre amigos, sem casa a ganhar. Usa o meu código ${code} ao criares a tua conta: ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">O teu código de convite</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-mono text-2xl font-black tracking-[0.15em] text-primary">{code}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="press flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-accent"
        >
          {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copiado" : "Copiar link"}
        </button>
      </div>

      <ActionButton
        type="button"
        variant="success"
        size="md"
        block
        icon={<MessageCircle className="size-[18px]" aria-hidden />}
        onClick={handleWhatsapp}
        className="mt-4"
      >
        Partilhar no WhatsApp
      </ActionButton>
    </div>
  );
}
