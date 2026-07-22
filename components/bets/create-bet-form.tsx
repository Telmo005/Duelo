"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Lock, Handshake, CalendarX, Search, Goal, Target } from "lucide-react";
import { createBetAction } from "@/lib/actions/bets";
import { TeamBadge } from "@/components/match/team-badge";
import { SectionLabel } from "@/components/ui/section-label";
import { OptionCard } from "@/components/ui/option-card";
import { InfoRow } from "@/components/ui/info-row";
import { ActionButton } from "@/components/ui/action-button";
import { Input } from "@/components/ui/input";
import { groupByLeague } from "@/lib/leagueTiers";
import { MARKET_LABEL, TOTAL_GOALS_LINES, marketPredictions, marketLabel, marketShortCode, type Market } from "@/lib/betMarkets";

export type MatchOption = {
  id: string;
  home: string;
  away: string;
  league: string;
  /** football-data.org league identity — null for manually-seeded matches. Two
   *  different countries can have identically-named leagues, so
   *  grouping/ranking uses this instead of the bare name string (see
   *  lib/leagueTiers.ts groupByLeague). */
  leagueId?: number | null;
  country?: string | null;
  kickoffLabel: string;
  /** Raw kickoff instant (ISO) — lets this list drop a match the moment its
   *  kickoff passes even if the page has been open a while (the server list
   *  is also filtered, but is cached up to 60s — see getUpcomingMatches in
   *  lib/bets.ts). bet_create rejects an already-started match regardless,
   *  so this is purely about never dangling a choice the server would just
   *  reject. */
  kickoffAtIso: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  /** Knockout fixture — extra time/penalties always produce a winner, so
   *  "Empate" is never offered as a prediction for one. */
  isElimination: boolean;
};

type PredictionKey = string;

const MARKETS: { key: Market; icon: "target" | "goal" | "handshake" }[] = [
  { key: "1x2", icon: "target" },
  { key: "total_goals", icon: "goal" },
  { key: "btts", icon: "handshake" },
];

const QUICK_STAKES = [10, 50, 100, 500, 1000];

function fmt(n: number) {
  return n.toLocaleString("pt", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function CreateBetForm({ matches, initialMatchId }: { matches: MatchOption[]; initialMatchId?: string }) {
  const [isPending, startTransition] = useTransition();

  // Re-checked every 30s so a match that kicks off while this form is just
  // sitting open (user still deciding) actually drops out of the picker,
  // instead of staying selectable until the server rejects it on submit.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const openMatches = useMemo(() => matches.filter((m) => new Date(m.kickoffAtIso).getTime() > now), [matches, now]);

  // Coming from the feed's "Jogos" tab, the match is already chosen — only
  // fall back to the first fixture in the list when there's no valid
  // preselection (direct /bets/new visit, or a stale/removed matchId).
  const preselected = initialMatchId && openMatches.some((m) => m.id === initialMatchId) ? initialMatchId : openMatches[0]?.id ?? "";
  const [matchId, setMatchId] = useState<string>(preselected);
  const [market, setMarket] = useState<Market>("1x2");
  const [line, setLine] = useState<number | null>(null);
  const [prediction, setPrediction] = useState<PredictionKey | null>(null);
  const [stake, setStake] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matchQuery, setMatchQuery] = useState("");

  function selectMarket(next: Market) {
    setMarket(next);
    setLine(null);
    setPrediction(null);
  }

  // If the selected match ages out (its kickoff passes while this form is
  // open) fall back to the next available one instead of leaving a phantom,
  // server-rejectable selection in place.
  useEffect(() => {
    if (matchId && !openMatches.some((m) => m.id === matchId)) {
      setMatchId(openMatches[0]?.id ?? "");
      setPrediction(null);
    }
  }, [openMatches, matchId]);

  const selectedMatch = openMatches.find((m) => m.id === matchId);
  const stakeNum = Number(stake) || 0;
  const needsLine = market === "total_goals";
  const canSubmit = !!matchId && !!prediction && (!needsLine || line !== null) && stakeNum > 0;

  // Knockout fixtures always produce a winner (extra time/penalties), so
  // "Empate" is never a valid prediction for 1x2 on one — total_goals/btts
  // have no draw concept at all, so isElimination never affects them.
  const availablePredictions = marketPredictions(market, selectedMatch?.isElimination ?? false).map((key) => ({
    key,
    code: marketShortCode(market, key, line),
  }));

  // Winner receives the full pot minus the platform's 10% commission —
  // same math regardless of market, since every market pays out the same
  // way once a winner is known.
  const pot = stakeNum * 2;
  const payout = pot * 0.9;
  const profit = payout - stakeNum;

  function predictionLabel(p: PredictionKey) {
    if (!selectedMatch) return "";
    return marketLabel(market, p, line, selectedMatch.home, selectedMatch.away);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createBetAction(
        market === "total_goals"
          ? { market, matchId, prediction: prediction!, line: line!, stakeMt: stake }
          : { market, matchId, prediction: prediction!, stakeMt: stake }
      );
      if (result?.error) setError(result.error);
    });
  }

  // Same "best leagues first" grouping the feed's own "Jogos" tab uses
  // (lib/leagueTiers.ts) plus a name search — this list can be long once the
  // catalogue fills up, and the match is already chosen by default (or via
  // the feed), so this is "change the match" rather than the primary path.
  const matchNeedle = matchQuery.trim().toLowerCase();
  const searchedMatches = matchNeedle
    ? openMatches.filter((m) => `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(matchNeedle))
    : openMatches;
  const matchGroups = useMemo(
    () => groupByLeague(searchedMatches, (m) => ({ league: m.league, leagueId: m.leagueId, country: m.country })),
    [searchedMatches]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* ── Selected match, always visible up top ─────────────────── */}
      {selectedMatch ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <div className="flex shrink-0 items-center gap-1.5">
            <TeamBadge name={selectedMatch.home} logoUrl={selectedMatch.homeLogoUrl} size={34} />
            <TeamBadge name={selectedMatch.away} logoUrl={selectedMatch.awayLogoUrl} size={34} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {selectedMatch.home} <span className="font-normal text-muted-foreground">vs</span> {selectedMatch.away}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedMatch.league} · {selectedMatch.kickoffLabel}
              {selectedMatch.isElimination && <span className="ml-1.5 font-semibold text-locked">· Eliminação</span>}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-5 py-8 text-center">
          <CalendarX className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Sem jogos disponíveis de momento.</p>
        </div>
      )}

      {/* ── Step 1: market ─────────────────────────────────────── */}
      {selectedMatch && (
        <section>
          <SectionLabel step={1}>Mercado</SectionLabel>
          <div className="grid grid-cols-3 gap-2.5">
            {MARKETS.map((m) => (
              <OptionCard
                key={m.key}
                selected={market === m.key}
                onSelect={() => selectMarket(m.key)}
                ariaLabel={MARKET_LABEL[m.key]}
                className="flex flex-col items-center gap-2 p-3.5 text-center"
              >
                <span className="flex size-[30px] items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden>
                  {m.icon === "target" ? <Target className="size-4" /> : m.icon === "goal" ? <Goal className="size-4" /> : <Handshake className="size-4" />}
                </span>
                <span className="text-xs font-semibold leading-tight">{MARKET_LABEL[m.key]}</span>
              </OptionCard>
            ))}
          </div>
        </section>
      )}

      {/* ── Step 2 (total_goals only): line ────────────────────── */}
      {selectedMatch && needsLine && (
        <section>
          <SectionLabel step={2}>Linha de golos</SectionLabel>
          <div className="grid grid-cols-3 gap-2.5">
            {TOTAL_GOALS_LINES.map((l) => (
              <OptionCard
                key={l}
                selected={line === l}
                onSelect={() => {
                  setLine(l);
                  setPrediction(null);
                }}
                ariaLabel={`Linha ${l.toFixed(1)} golos`}
                className="flex items-center justify-center p-3.5 text-center"
              >
                <span className="text-sm font-bold">{l.toFixed(1)}</span>
              </OptionCard>
            ))}
          </div>
        </section>
      )}

      {/* ── Step: prediction ───────────────────────────────────── */}
      {selectedMatch && (!needsLine || line !== null) && (
        <section>
          <SectionLabel step={needsLine ? 3 : 2}>A tua previsão</SectionLabel>
          {market === "1x2" && selectedMatch.isElimination && (
            <p className="mb-2.5 -mt-1 text-xs font-medium text-muted-foreground">
              Jogo de eliminação — não há opção de empate, há sempre um vencedor.
            </p>
          )}
          <div className={`grid gap-2.5 ${availablePredictions.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {availablePredictions.map((p) => (
              <OptionCard
                key={p.key}
                selected={prediction === p.key}
                onSelect={() => setPrediction(p.key)}
                ariaLabel={predictionLabel(p.key)}
                className="flex flex-col items-center gap-2 p-3.5 text-center"
              >
                {market !== "1x2" ? (
                  <span className="flex size-[30px] items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden>
                    {market === "total_goals" ? <Goal className="size-4" /> : <Handshake className="size-4" />}
                  </span>
                ) : p.key === "draw" ? (
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

      {/* ── Step: stake ────────────────────────────────────────── */}
      <section>
        <SectionLabel step={needsLine ? 4 : 3} htmlFor="stake">Valor da aposta</SectionLabel>
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
        <div className="animate-fade-up overflow-hidden rounded-2xl border border-success-25 bg-success/[0.06] px-4">
          <InfoRow label="A tua entrada" value={`${fmt(stakeNum)} MT`} className="border-b border-success-15" />
          <InfoRow label="Pote total (2 lados)" value={`${fmt(pot)} MT`} className="border-b border-success-15" />
          <InfoRow
            label="Comissão da plataforma (10%)"
            value={`−${fmt(pot * 0.1)} MT`}
            valueClassName="text-muted-foreground"
            className="border-b border-success-15"
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
        <div role="alert" className="rounded-xl border border-destructive-35 bg-destructive-10 px-4 py-3 text-sm leading-snug text-destructive">
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

      {/* ── Trocar de jogo — searchable, league-grouped, scrolls on its
           own so browsing it never drags the whole page down with it. ── */}
      <section>
        <SectionLabel>Trocar de jogo</SectionLabel>
        <div className="relative mb-2.5">
          <Input
            value={matchQuery}
            onChange={(e) => setMatchQuery(e.target.value)}
            placeholder="Procurar equipa ou liga..."
            className="pr-8"
          />
          <Search className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>

        {matchGroups.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {openMatches.length === 0 ? "Sem jogos disponíveis de momento." : "Nenhum jogo encontrado."}
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-2xl border border-border">
            <div className="flex flex-col gap-3 p-2.5">
              {matchGroups.map(([league, leagueMatches]) => (
                <div key={league} className="flex flex-col gap-1.5">
                  <SectionLabel className="mb-0 px-0.5">{league}</SectionLabel>
                  {leagueMatches.map((m) => (
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
                        <p className="truncate text-xs text-muted-foreground">
                          {m.league} · {m.kickoffLabel}
                          {m.isElimination && <span className="ml-1.5 font-semibold text-locked">· Eliminação</span>}
                        </p>
                      </div>
                    </OptionCard>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </form>
  );
}
