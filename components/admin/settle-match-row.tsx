"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Radio, Pause, Play, RefreshCw } from "lucide-react";
import { settleMatchAction, voidMatchAction } from "@/lib/actions/settlement";
import { deleteMatchAction, updateLiveScoreAction, updateLiveScoreFromApiAction } from "@/lib/actions/matches";
import { EditMatchForm } from "@/components/admin/edit-match-form";
import type { MatchRow } from "@/db/schema";
import { Spinner } from "@/components/ui/spinner";
import { MOZAMBIQUE_TIMEZONE } from "@/lib/format";

type ActiveAction = "settle" | "postponed" | "abandoned" | "delete" | "live" | "api" | null;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  live: { label: "● Ao vivo", className: "bg-primary-10 text-primary" },
  needs_review: { label: "Precisa de liquidação", className: "bg-destructive-10 text-destructive" },
};

/** Mirrors lib/bets.ts computeElapsedMinuteLabel — duplicated rather than
 *  imported since that file pulls in server-only db code that shouldn't
 *  bundle into this client component (same reasoning as the lib/ledger-
 *  format.ts split documented elsewhere in this codebase). Shown as a hint
 *  so the admin knows leaving "min" blank isn't "no minute", it's "let the
 *  automatic kickoff clock handle it". */
function computeElapsedMinuteLabel(kickoffAt: Date): string {
  const minutes = Math.max(0, Math.floor((Date.now() - kickoffAt.getTime()) / 60000));
  return minutes > 90 ? "90+" : String(minutes);
}

/** Mirrors lib/bets.ts computeLiveMinuteLabel (migration 0029) — same
 *  duplication reasoning as computeElapsedMinuteLabel above. Returns null
 *  only when no admin checkpoint exists yet for this match (nothing to
 *  pause/resume/tick — the placeholder auto clock is shown instead). `now`
 *  is passed in rather than read via Date.now() internally so the ticking
 *  readout below can force a recompute on an interval. */
function currentLiveMinute(match: MatchRow, now: number): number | null {
  if (match.liveMinute == null) return null;
  if (match.livePaused || !match.liveMinuteAnchorAt) return match.liveMinute;
  const elapsed = Math.max(0, Math.floor((now - new Date(match.liveMinuteAnchorAt).getTime()) / 60000));
  return match.liveMinute + elapsed;
}

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

  // Ticks the "Relógio" readout below forward every 15s so a running (not
  // paused) clock visibly counts up without needing a page reload — the
  // actual source of truth is still liveMinute + liveMinuteAnchorAt
  // (recomputed server-side on every read elsewhere), this is display only.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (match.livePaused) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [match.livePaused]);

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

  // Fetches ONLY this match from API-Football (a single-fixture lookup, see
  // fetchFixtureById) and writes it through the same path as a manual
  // update — an admin who links a match to the API never needs to check
  // another site for the score or leave the app running a poller: one
  // click, one request, scoped to the one match someone actually bet on.
  function handleRefreshFromApi() {
    setActiveAction("api");
    startTransition(async () => {
      const result = await updateLiveScoreFromApiAction(match.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setLiveHome(String(result.homeGoals));
        setLiveAway(String(result.awayGoals));
        setLiveMinute(result.minute != null ? String(result.minute) : "");
        toast.success(`Atualizado da API — ${result.statusLabel}`);
      }
      setActiveAction(null);
    });
  }

  // Pausar freezes the clock exactly where it currently reads (half-time,
  // injury delay, etc.) instead of it ticking on through the break; Retomar
  // resets the anchor to now() so it continues counting up from that same
  // number rather than jumping to reflect the paused duration. Carries the
  // current score fields along since updateLiveScoreAction always writes
  // both together.
  function handleTogglePause() {
    if (liveHome === "" || liveAway === "") return;
    const minuteNow = currentLiveMinute(match, Date.now());
    if (minuteNow == null) return;
    const nextPaused = !match.livePaused;
    setActiveAction("live");
    startTransition(async () => {
      const result = await updateLiveScoreAction(match.id, {
        homeGoals: liveHome,
        awayGoals: liveAway,
        minute: minuteNow,
        paused: nextPaused,
      });
      if (result?.error) toast.error(result.error);
      else toast.success(nextPaused ? "Relógio pausado" : "Relógio retomado — a contar a partir daqui");
      setLiveMinute(String(minuteNow));
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
          {match.league} · {new Date(match.kickoffAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short", timeZone: MOZAMBIQUE_TIMEZONE })}
          {match.externalId ? ` · API #${match.externalId}` : " · sem ligação à API"}
        </p>
      </div>

      {/* Placar ao vivo — display-only, updates as goals happen, never pays
       *  anyone. The minute is optional: leave it blank and the feed shows
       *  the automatic kickoff-based clock instead (see
       *  computeElapsedMinuteLabel in lib/bets.ts) — only fill it in to
       *  correct/override that (e.g. stoppage time). Once set, it's a real
       *  ticking clock (migration 0029): "Atualizar" resets it to keep
       *  counting up from whatever was just typed instead of freezing there
       *  forever, and Pausar/Retomar lets the admin stop it exactly for a
       *  real break (half-time, injury delay) without losing the count.
       *  Kept visually and functionally separate from Liquidar below, which
       *  is the one action that actually settles bets and pays out. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/40 px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Radio className="size-3.5" aria-hidden /> Placar ao vivo
        </span>
        <ScoreInputs home={liveHome} away={liveAway} onHomeChange={setLiveHome} onAwayChange={setLiveAway} disabled={isPending} />
        <input
          type="number"
          min={0}
          max={150}
          placeholder={
            match.matchStatus === "live" || match.matchStatus === "needs_review"
              ? `auto ${computeElapsedMinuteLabel(match.kickoffAt)}'`
              : "min"
          }
          value={liveMinute}
          onChange={(e) => setLiveMinute(e.target.value)}
          disabled={isPending}
          className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-xs outline-none focus:border-primary disabled:opacity-50"
        />
        {match.externalId && (
          <button
            type="button"
            onClick={handleRefreshFromApi}
            disabled={isPending}
            title="Consulta só este jogo na API-Football — um único pedido"
            className="press inline-flex items-center gap-1.5 rounded-lg border border-primary-30 bg-primary-10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activeAction === "api" ? <Spinner className="size-3" /> : <RefreshCw className="size-3" aria-hidden />}
            {activeAction === "api" ? "A consultar…" : "Última atualização"}
          </button>
        )}
        <button
          type="button"
          onClick={handleUpdateLiveScore}
          disabled={isPending || liveHome === "" || liveAway === ""}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {activeAction === "live" && <Spinner className="size-3" />}
          {activeAction === "live" ? "A atualizar…" : "Atualizar"}
        </button>
        {currentLiveMinute(match, now) != null && (
          <button
            type="button"
            onClick={handleTogglePause}
            disabled={isPending || liveHome === "" || liveAway === ""}
            className={`press inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              match.livePaused ? "border-success bg-success-10 text-success" : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {match.livePaused ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
            {match.livePaused ? "Retomar" : "Pausar"}
          </button>
        )}
        {currentLiveMinute(match, now) != null && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
            Relógio: {currentLiveMinute(match, now)}'{match.livePaused ? " (pausado)" : ""}
          </span>
        )}
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
