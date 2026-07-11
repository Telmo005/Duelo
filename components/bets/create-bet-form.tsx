"use client";

import { useState, useTransition } from "react";
import { createBetAction } from "@/lib/actions/bets";
import { TeamBadge } from "@/components/match/team-badge";
import { Spinner } from "@/components/ui/spinner";

export type MatchOption = {
  id: string;
  home: string;
  away: string;
  league: string;
  kickoffLabel: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
};

const PREDICTIONS = [
  { key: "home", code: "1" },
  { key: "draw", code: "X" },
  { key: "away", code: "2" },
] as const;

type PredictionKey = (typeof PREDICTIONS)[number]["key"];

const QUICK_STAKES = [10, 50, 100, 500, 1000];

function fmt(n: number) {
  return n.toLocaleString("pt", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function CreateBetForm({ matches }: { matches: MatchOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [matchId, setMatchId] = useState<string>(matches[0]?.id ?? "");
  const [prediction, setPrediction] = useState<PredictionKey | null>(null);
  const [stake, setStake] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedMatch = matches.find((m) => m.id === matchId);
  const stakeNum = Number(stake) || 0;
  const canSubmit = !!matchId && !!prediction && stakeNum > 0;

  // Winner receives the full pot minus the platform's 10% commission.
  const pot = stakeNum * 2;
  const payout = pot * 0.9;
  const profit = payout - stakeNum;

  function predictionLabel(p: PredictionKey) {
    if (!selectedMatch) return "";
    if (p === "home") return `${selectedMatch.home} ganha`;
    if (p === "away") return `${selectedMatch.away} ganha`;
    return "Empate";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createBetAction({ matchId, prediction: prediction!, stakeMt: stake });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ── Step 1: pick the match ─────────────────────────────── */}
      <section>
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">1</span>
          Escolhe o jogo
        </p>

        <div className="flex flex-col gap-2">
          {matches.map((m) => {
            const isActive = matchId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMatchId(m.id); setPrediction(null); }}
                aria-pressed={isActive}
                className={`press flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                  isActive ? "border-primary/60 bg-primary/[0.07]" : "border-border bg-card hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <TeamBadge name={m.home} logoUrl={m.homeLogoUrl} size={30} />
                  <TeamBadge name={m.away} logoUrl={m.awayLogoUrl} size={30} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{m.home} <span className="text-muted-foreground">vs</span> {m.away}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.league} · {m.kickoffLabel}</p>
                </div>
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isActive ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                  aria-hidden
                >
                  {isActive && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.5L5 9l4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Step 2: prediction ─────────────────────────────────── */}
      {selectedMatch && (
        <section>
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">2</span>
            A tua previsão
          </p>

          <div className="grid grid-cols-3 gap-2.5">
            {PREDICTIONS.map((p) => {
              const isActive = prediction === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPrediction(p.key)}
                  aria-pressed={isActive}
                  className={`press flex flex-col items-center gap-2 rounded-2xl border p-3.5 text-center transition-colors ${
                    isActive ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(242,194,42,0.15)]" : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  {p.key === "draw" ? (
                    <span className="flex size-[38px] items-center justify-center text-2xl" aria-hidden>🤝</span>
                  ) : (
                    <TeamBadge
                      name={p.key === "home" ? selectedMatch.home : selectedMatch.away}
                      logoUrl={p.key === "home" ? selectedMatch.homeLogoUrl : selectedMatch.awayLogoUrl}
                      size={30}
                    />
                  )}
                  <span
                    className={`flex size-5 items-center justify-center rounded-md text-[11px] font-extrabold ${
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.code}
                  </span>
                  <span className="text-xs font-semibold leading-tight">{predictionLabel(p.key)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Step 3: stake ──────────────────────────────────────── */}
      <section>
        <label htmlFor="stake" className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">3</span>
          Valor da aposta
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors focus-within:border-primary">
          <input
            id="stake"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000000}
            placeholder="0"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="w-full bg-transparent text-2xl font-extrabold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/50"
          />
          <span className="text-lg font-semibold text-muted-foreground">MT</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_STAKES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStake(String(v))}
              className={`press rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                stake === String(v) ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {v} MT
            </button>
          ))}
        </div>
      </section>

      {/* ── Bet slip ───────────────────────────────────────────── */}
      {stakeNum > 0 && (
        <div className="animate-fade-up overflow-hidden rounded-2xl border border-success/25 bg-success/[0.06]">
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-muted-foreground">A tua entrada</span>
            <span className="font-bold tabular-nums">{fmt(stakeNum)} MT</span>
          </div>
          <div className="flex items-center justify-between border-t border-success/15 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Pote total (2 lados)</span>
            <span className="font-bold tabular-nums">{fmt(pot)} MT</span>
          </div>
          <div className="flex items-center justify-between border-t border-success/15 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Comissão da plataforma (10%)</span>
            <span className="font-bold tabular-nums text-muted-foreground">−{fmt(pot * 0.1)} MT</span>
          </div>
          <div className="flex items-center justify-between border-t border-success/20 bg-success/[0.06] px-4 py-3.5">
            <span className="text-sm font-bold">Recebes se ganhares</span>
            <span className="text-right">
              <span className="block text-lg font-extrabold tabular-nums text-success">{fmt(payout)} MT</span>
              <span className="block text-xs font-semibold text-success/70">+{fmt(profit)} MT de lucro</span>
            </span>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm leading-snug text-destructive">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || isPending}
        className="press flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-extrabold tracking-tight text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
      >
        {isPending && <Spinner />}
        {isPending ? "A criar…" : canSubmit ? "🔒 Criar aposta" : "Completa os passos acima"}
      </button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        O valor fica bloqueado na tua carteira até um adversário aceitar e o jogo terminar.
      </p>
    </form>
  );
}
