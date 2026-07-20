"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { refreshAllLiveMatchesAction } from "@/lib/actions/matches";
import { Spinner } from "@/components/ui/spinner";

/** Refreshes every 'live'/'needs_review' match linked to the API in one
 *  request (live=all) instead of clicking "Última atualização" per row —
 *  see refreshAllLiveMatchesAction for why a match can still come back
 *  listed as "sem dados" (it most likely already finished). */
export function RefreshLiveMatchesButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await refreshAllLiveMatchesAction();
      if (result.error && result.updated === 0) {
        toast.error(result.error);
        return;
      }
      if (result.updated > 0) {
        toast.success(`${result.updated} jogo(s) atualizado(s)`);
      }
      if (result.missing.length > 0) {
        toast.info(`Sem dados ao vivo para: ${result.missing.join(", ")} — confere jogo a jogo com "Última atualização".`, {
          duration: 7000,
        });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Um único pedido à API-Football (live=all) para todos os jogos ao vivo"
      className="press inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Spinner className="size-4" /> : <RefreshCw className="size-4" aria-hidden />}
      {isPending ? "A atualizar…" : "Atualizar jogos ao vivo"}
    </button>
  );
}
