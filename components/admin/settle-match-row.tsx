"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Radio } from "lucide-react";
import { settleMatchAction, voidMatchAction } from "@/lib/actions/settlement";
import { deleteMatchAction, updateLiveScoreAction } from "@/lib/actions/matches";
import { EditMatchForm } from "@/components/admin/edit-match-form";
import type { MatchRow } from "@/db/schema";
import { Spinner } from "@/components/ui/spinner";

type ActiveAction = "settle" | "postponed" | "abandoned" | "delete" | "live" | null;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  live: { label: "● Ao vivo", className: "bg-primary-10 text-primary" },
  needs_review: { label: "Precisa de liquidação", className: "bg-destructive-10 text-destructive" },
};

/** Small "X-Y" pair of number inputs, reused for both the live-score
 *  tracker and the final settlement score — same shape, different action
 *  behind them. */
function ScoreInputs({
  home,
  away,
  onHomeChange,
  onAwayChange,
  disabled,
}: {
  home: string;
  away: string;
  onHomeChange: (v: string) => void;
  onAwayChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <input
        type="number"
        min={0}
        max={50}
        placeholder="0"
        value={home}
        onChange={(e) => onHomeChange(e.target.value)}
        disabled={disabled}
        className="w-12 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-primary disabled:opacity-50"
      />
      <span className="text-muted-foreground">—</span>
      <input
        type="number"
        min={0}
        max={50}
        placeholder="0"
        value={away}
        onChange={(e) => onAwayChange(e.target.value)}
        disabled={disabled}
        className="w-12 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-primary disabled:opacity-50"
      />
    </>
  );
}

export function SettleMatchRow({ match }: { match: MatchRow }) {
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [liveHome, setLiveHome] = useState(match.liveHome != null ? String(match.liveHome) : "");
  const [liveAway, setLiveAway] = useState(match.liveAway != null ? String(match.liveAway) : "");
  const [liveMinute, setLiveMinute] = useState(match.liveMinute != null ? String(match.liveMinute) : "");
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

  const isDrawEntered = home !== "" && away !== "" && home === away;
  const blockedByElimination = match.isElimination && isDrawEntered;

  function handleSettle() {
    if (home === "" || away === "" || blockedByElimination) return;
    setActiveAction("settle");
    startTransition(async () => {
      const result = await settleMatchAction(match.id, Number(home), Number(away));
      if (result?.error) toast.error(result.error);
      else toast.success("Aposta(s) liquidada(s) com sucesso — pagamentos processados");
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

  function handleUpdateLiveScore() {
    if (liveHome === "" || liveAway === "") return;
    setActiveAction("live");
    startTransition(async () => {
      const result = await updateLiveScoreAction(match.id, {
        homeGoals: liveHome,
        awayGoals: liveAway,
        minute: liveMinute || undefined,
      });
      if (result?.error) toast.error(result.error);
      else toast.success("Placar ao vivo atualizado");
      setActiveAction(null);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0">
      <div>
        <p className="text-sm font-bold">
          {match.home} <span className="font-normal text-muted-foreground">vs</span> {match.away}
          {match.isElimination && (
            <span className="ml-2 rounded-full bg-locked-10 px-2 py-0.5 text-[10px] font-bold text-locked">ELIMINAÇÃO</span>
          )}
          {STATUS_BADGE[match.matchStatus] && (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[match.matchStatus].className}`}>
              {STATUS_BADGE[match.matchStatus].label}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {match.league} · {new Date(match.kickoffAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
          {match.externalId ? ` · API #${match.externalId}` : " · sem ligação à API"}
        </p>
      </div>

      {/* Placar ao vivo — display-only, updates as goals happen, never pays
       *  anyone. Kept visually and functionally separate from Liquidar
       *  below, which is the one action that actually settles bets and
       *  pays out. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/40 px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Radio className="size-3.5" aria-hidden /> Placar ao vivo
        </span>
        <ScoreInputs home={liveHome} away={liveAway} onHomeChange={setLiveHome} onAwayChange={setLiveAway} disabled={isPending} />
        <input
          type="number"
          min={0}
          max={150}
          placeholder="min"
          value={liveMinute}
          onChange={(e) => setLiveMinute(e.target.value)}
          disabled={isPending}
          className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-xs outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleUpdateLiveScore}
          disabled={isPending || liveHome === "" || liveAway === ""}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {activeAction === "live" && <Spinner className="size-3" />}
          {activeAction === "live" ? "A atualizar…" : "Atualizar"}
        </button>
        {match.liveUpdatedAt && (
          <span className="text-[11px] text-muted-foreground">
            Última atualização: {new Date(match.liveUpdatedAt).toLocaleTimeString("pt", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {blockedByElimination && (
        <p className="text-xs font-semibold text-destructive">
          Jogo de eliminação não pode terminar empatado — indica o resultado decisivo (ex: após penáltis).
        </p>
      )}

      {/* Liquidar — the ONE action that pays out. Separate score inputs on
       *  purpose: this is the final, official result, entered once at full
       *  time, not the same value being nudged up throughout the match. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground">Resultado final</span>
        <ScoreInputs home={home} away={away} onHomeChange={setHome} onAwayChange={setAway} disabled={isPending} />
        <button
          type="button"
          onClick={handleSettle}
          disabled={isPending || home === "" || away === "" || blockedByElimination}
          className="press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {activeAction === "settle" && <Spinner className="size-3" />}
          {activeAction === "settle" ? "A liquidar…" : "Liquidar e pagar"}
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
              ? "border-destructive bg-destructive-10 text-destructive"
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
