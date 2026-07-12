"use client";

import { useTransition } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

/** "Partilhar" action shown on closed/read-only duels. Real, backend-free
 *  implementation (Web Share API with clipboard fallback). No "coming soon"
 *  dead buttons — only actions that actually do something ship. */
export function DuelSecondaryActions({ duelId }: { duelId: string }) {
  const [isSharing, startShare] = useTransition();

  function handleShare() {
    startShare(async () => {
      const url = `${window.location.origin}/d/${duelId}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Duelo", url });
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
      {isSharing ? "A partilhar…" : "Partilhar"}
    </button>
  );
}
