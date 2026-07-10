"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";

/** "Seguir"/"Partilhar" row shown on closed/read-only duels. Partilhar has a
 *  real, backend-free implementation (Web Share API, clipboard fallback).
 *  Seguir has no following feature behind it yet — clicking gives an honest
 *  "em breve" toast rather than silently doing nothing. */
export function DuelSecondaryActions({ duelId }: { duelId: string }) {
  const [isSharing, startShare] = useTransition();

  function handleFollow() {
    toast("Seguir apostadores chega em breve.");
  }

  function handleShare() {
    startShare(async () => {
      const url = `${window.location.origin}/?duel=${duelId}`;
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
    <div className="flex items-center">
      <button
        type="button"
        onClick={handleFollow}
        className="press flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent"
      >
        👀 Seguir
      </button>
      <button
        type="button"
        onClick={handleShare}
        disabled={isSharing}
        className="press flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSharing && <Spinner className="size-3.5" />}
        {isSharing ? "A partilhar…" : "↗ Partilhar"}
      </button>
    </div>
  );
}
