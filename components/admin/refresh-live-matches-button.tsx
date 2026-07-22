"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { refreshAllLiveMatchesAction } from "@/lib/actions/matches";
import { Spinner } from "@/components/ui/spinner";

/** Refreshes every 'live'/'needs_review' match linked to the API in one
 *  request (football-data.org's status=LIVE filter, plus a per-match
 *  fallback for anything that just finished — see syncLiveMatchesFromApi)
 *  instead of clicking "Última atualização" per row. A match can still come
 *  back listed as "sem dados" if even the fallback finds nothing (e.g. not
 *  actually started yet on the vendor's side). */
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
      title="Um único pedido à API para todos os jogos ao vivo"
      className="press inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Spinner className="size-4" /> : <RefreshCw className="size-4" aria-hidden />}
      {isPending ? "A atualizar…" : "Atualizar jogos ao vivo"}
    </button>
  );
}
