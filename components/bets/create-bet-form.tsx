"use client";

import { useState, useTransition } from "react";
import { Lock, Handshake } from "lucide-react";
import { createBetAction } from "@/lib/actions/bets";
import { TeamBadge } from "@/components/match/team-badge";
import { SectionLabel } from "@/components/ui/section-label";
import { OptionCard } from "@/components/ui/option-card";
import { InfoRow } from "@/components/ui/info-row";
import { ActionButton } from "@/components/ui/action-button";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* ── Step 1: pick the match ─────────────────────────────── */}
      <section>
        <SectionLabel step={1}>Escolhe o jogo</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {matches.map((m) => (
            <OptionCard
              key={m.id}
              selected={matchId === m.id}
              onSelect={() => { setMatchId(m.id); setPrediction(null); }}
              ariaLabel={`${m.home} vs ${m.away}`}
              className="flex items-center gap-3 pr-10"
            >
              <div className="flex items-center gap-1.5">
                <TeamBadge name={m.home} logoUrl={m.homeLogoUrl} size={30} />
                <TeamBadge name={m.away} logoUrl={m.awayLogoUrl} size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {m.home} <span className="text-muted-foreground">vs</span> {m.away}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.league} · {m.kickoffLabel}</p>
              </div>
            </OptionCard>
          ))}
        </div>
      </section>

      {/* ── Step 2: prediction ─────────────────────────────────── */}
      {selectedMatch && (
        <section>
          <SectionLabel step={2}>A tua previsão</SectionLabel>
          <div className="grid grid-cols-3 gap-2.5">
            {PREDICTIONS.map((p) => (
              <OptionCard
                key={p.key}
                selected={prediction === p.key}
                onSelect={() => setPrediction(p.key)}
                ariaLabel={predictionLabel(p.key)}
                className="flex flex-col items-center gap-2 p-3.5 text-center"
              >
                {p.key === "draw" ? (
                  <span className="flex size-[30px] items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden>
                    <Handshake className="size-4" />
                  </span>
                ) : (
                  <TeamBadge
                    name={p.key === "home" ? selectedMatch.home : selectedMatch.away}
                    logoUrl={p.key === "home" ? selectedMatch.homeLogoUrl : selectedMatch.awayLogoUrl}
                    size={30}
                  />
                )}
                <span
                  className={`flex size-5 items-center justify-center rounded-md text-[11px] font-extrabold ${
                    prediction === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.code}
                </span>
                <span className="text-xs font-semibold leading-tight">{predictionLabel(p.key)}</span>
              </OptionCard>
            ))}
          </div>
        </section>
      )}

      {/* ── Step 3: stake ──────────────────────────────────────── */}
      <section>
        <SectionLabel step={3} htmlFor="stake">Valor da aposta</SectionLabel>
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

      {/* ── Bet slip (static information) ───────────────────────── */}
      {stakeNum > 0 && (
        <div className="animate-fade-up overflow-hidden rounded-2xl border border-success/25 bg-success/[0.06] px-4">
          <InfoRow label="A tua entrada" value={`${fmt(stakeNum)} MT`} className="border-b border-success/15" />
          <InfoRow label="Pote total (2 lados)" value={`${fmt(pot)} MT`} className="border-b border-success/15" />
          <InfoRow
            label="Comissão da plataforma (10%)"
            value={`−${fmt(pot * 0.1)} MT`}
            valueClassName="text-muted-foreground"
            className="border-b border-success/15"
          />
          <InfoRow
            label="Recebes se ganhares"
            emphasis
            value={
              <span>
                <span className="block text-success">{fmt(payout)} MT</span>
                <span className="block text-xs font-semibold text-success/70">+{fmt(profit)} MT de lucro</span>
              </span>
            }
          />
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm leading-snug text-destructive">
          {error}
        </div>
      )}

      <ActionButton
        type="submit"
        size="lg"
        block
        disabled={!canSubmit}
        loading={isPending}
        icon={canSubmit ? <Lock className="size-[18px]" aria-hidden /> : undefined}
      >
        {isPending ? "A criar…" : canSubmit ? "Criar aposta" : "Completa os passos acima"}
      </ActionButton>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        O valor fica bloqueado na tua carteira até um adversário aceitar e o jogo terminar.
      </p>
    </form>
  );
}
