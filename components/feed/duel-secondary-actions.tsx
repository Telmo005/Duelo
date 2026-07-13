"use client";

import { useTransition } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

/** "Partilhar" action shown on closed/read-only duels. Real, backend-free
 *  implementation (Web Share API with clipboard fallback). No "coming soon"
 *  dead buttons — only actions that actually do something ship. */
export function DuelSecondaryActions({
  duelId,
  reference,
  creatorName,
}: {
  duelId: string;
  /** Short human code (DUE-BET-XXXXXXXX) — preferred over the raw id for
   *  the shared link, since a bare UUID reads as a spammy tracking link.
   *  Falls back to duelId for the logged-out marketing preview, which has
   *  no real reference. */
  reference?: string;
  creatorName: string;
}) {
  const [isSharing, startShare] = useTransition();

  function handleShare() {
    startShare(async () => {
      const url = `${window.location.origin}/d/${reference ?? duelId}`;
      // Short, self-contained challenge line — the link's own OG preview
      // already carries the match/crests/stake, so this only needs to say
      // *why* the recipient is getting this link, not repeat what's in it.
      const text = `🔥 ${creatorName} desafiou-te para um duelo na Duelo. Aceita o desafio:`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Duelo", text, url });
        } catch {
          // user cancelled the native share sheet — not an error
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      } catch {
        toast.error("Não foi possível copiar o link.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={isSharing}
      className="press flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSharing ? <Spinner className="size-3.5" /> : <Share2 className="size-4" aria-hidden />}
      {isSharing ? "A desafiar…" : "Desafiar"}
    </button>
  );
}
