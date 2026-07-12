"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Pencil } from "lucide-react";
import { settleMatchAction, voidMatchAction } from "@/lib/actions/settlement";
import { deleteMatchAction } from "@/lib/actions/matches";
import { EditMatchForm } from "@/components/admin/edit-match-form";
import type { MatchRow } from "@/db/schema";
import { Spinner } from "@/components/ui/spinner";

type ActiveAction = "settle" | "postponed" | "abandoned" | "delete" | null;

export function SettleMatchRow({ match }: { match: MatchRow }) {
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditMatchForm match={match} onDone={() => setEditing(false)} />;
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setActiveAction("delete");
    startTransition(async () => {
      const result = await deleteMatchAction(match.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Jogo removido do catálogo");
      setActiveAction(null);
      setConfirmDelete(false);
    });
  }

  function handleSettle() {
    if (home === "" || away === "") return;
    setActiveAction("settle");
    startTransition(async () => {
      const result = await settleMatchAction(match.id, Number(home), Number(away));
      if (result?.error) toast.error(result.error);
      else toast.success("Aposta(s) liquidada(s) com sucesso");
      setActiveAction(null);
    });
  }

  function handleVoid(status: "postponed" | "abandoned") {
    setActiveAction(status);
    startTransition(async () => {
      const result = await voidMatchAction(match.id, status);
      if (result?.error) toast.error(result.error);
      else toast.success("Reembolsado com sucesso");
      setActiveAction(null);
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
          {match.externalId ? ` · API #${match.externalId}` : " · sem ligação à API"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          max={20}
          placeholder="0"
          value={home}
          onChange={(e) => setHome(e.target.value)}
          className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-primary"
        />
        <span className="text-muted-foreground">—</span>
        <input
          type="number"
          min={0}
          max={20}
          placeholder="0"
          value={away}
          onChange={(e) => setAway(e.target.value)}
          className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={handleSettle}
          disabled={isPending || home === "" || away === ""}
          className="press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {activeAction === "settle" && <Spinner className="size-3" />}
          {activeAction === "settle" ? "A liquidar…" : "Liquidar"}
        </button>
        <button
          type="button"
          onClick={() => handleVoid("postponed")}
          disabled={isPending}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {activeAction === "postponed" && <Spinner className="size-3" />}
          {activeAction === "postponed" ? "A processar…" : "Adiado"}
        </button>
        <button
          type="button"
          onClick={() => handleVoid("abandoned")}
          disabled={isPending}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {activeAction === "abandoned" && <Spinner className="size-3" />}
          {activeAction === "abandoned" ? "A processar…" : "Abandonado"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={isPending}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="size-3" aria-hidden />
          Editar
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className={`press inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            confirmDelete
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {activeAction === "delete" ? <Spinner className="size-3" /> : <Trash2 className="size-3" aria-hidden />}
          {activeAction === "delete" ? "A remover…" : confirmDelete ? "Confirmar remoção?" : "Remover"}
        </button>
      </div>
    </div>
  );
}
