"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteMatchAction } from "@/lib/actions/matches";
import type { MatchRow } from "@/db/schema";
import { Spinner } from "@/components/ui/spinner";

const STATUS_LABEL: Record<string, string> = {
  postponed: "Adiado",
  abandoned: "Abandonado",
  finished: "Liquidado",
};

/** A match no longer 'scheduled' (postponed/abandoned/finished) — nothing
 *  left to settle or edit, but it can still clutter the catalogue (it stays
 *  selectable-looking until removed, even though getUpcomingMatches already
 *  excludes it from actual bet creation). The only action left is Remover. */
export function ProcessedMatchRow({ match }: { match: MatchRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await deleteMatchAction(match.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Jogo removido do catálogo");
      setConfirmDelete(false);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold">
          {match.home} <span className="font-normal text-muted-foreground">vs</span> {match.away}
        </p>
        <p className="text-xs text-muted-foreground">
          {match.league} · {new Date(match.kickoffAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
          {" · "}
          <span className="font-semibold text-locked">{STATUS_LABEL[match.matchStatus] ?? match.matchStatus}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className={`press inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          confirmDelete
            ? "border-destructive bg-destructive-10 text-destructive"
            : "border-border text-muted-foreground hover:bg-accent"
        }`}
      >
        {isPending ? <Spinner className="size-3" /> : <Trash2 className="size-3" aria-hidden />}
        {isPending ? "A remover…" : confirmDelete ? "Confirmar remoção?" : "Remover"}
      </button>
    </div>
  );
}
