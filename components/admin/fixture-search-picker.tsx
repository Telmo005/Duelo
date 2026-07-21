"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Search, Radar, Check } from "lucide-react";
import { searchFixturesAction, addFixturesBulkAction } from "@/lib/actions/matches";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { Spinner } from "@/components/ui/spinner";
import { ActionButton } from "@/components/ui/action-button";
import { leagueRank } from "@/lib/leagueTiers";
import type { FixtureSearchResult } from "@/lib/sportsData";

/** "YYYY-MM-DD" in the browser's LOCAL date, `offsetDays` from today — same
 *  local-vs-UTC reasoning as toDatetimeLocal in kickoff-field.tsx. */
function localDateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_OPTIONS = [
  { label: "Hoje", offset: 0 },
  { label: "Amanhã", offset: 1 },
  { label: "Depois de amanhã", offset: 2 },
];

const RESULTS_CAP = 150;

/**
 * "Procurar jogo real" — an optional search (football-data.org, unfiltered
 * `/matches?dateFrom=&dateTo=`) that lists every real match on a given day so
 * an admin can tick the ones they want and add them all in one go, instead of
 * typing teams/league/kickoff by hand one match at a time. Only offers
 * Hoje/Amanhã/Depois de amanhã — a deliberate UI choice to keep the picker
 * simple, not a vendor limitation. Purely additive/self-contained: it inserts
 * the matches itself (via addFixturesBulkAction) and never touches the manual
 * form below it — Moçambola/anything the API doesn't cover still goes
 * through manual entry exactly as before this existed.
 */
export function FixtureSearchPicker() {
  const [dayOffset, setDayOffset] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FixtureSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isAdding, startAdding] = useTransition();

  async function loadDay(offset: number) {
    setDayOffset(offset);
    setQuery("");
    setSelected(new Set());
    setLoading(true);
    setError(null);
    const { fixtures, error: fetchError } = await searchFixturesAction(localDateStr(offset));
    setResults(fixtures);
    setError(fetchError ?? null);
    setLoading(false);
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? results.filter((fx) => `${fx.home} ${fx.away} ${fx.league}`.toLowerCase().includes(needle))
    : results;

  // Best leagues first (shared with the feed's own league-group ordering —
  // see lib/leagueTiers.ts), then soonest kickoff within a league.
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const r = leagueRank(a.league, a.country) - leagueRank(b.league, b.country);
        return r !== 0 ? r : a.kickoffAtIso.localeCompare(b.kickoffAtIso);
      }),
    [filtered]
  );
  const shown = sorted.slice(0, RESULTS_CAP);
  const shownIds = useMemo(() => new Set(shown.map((fx) => fx.externalId)), [shown]);
  const allShownSelected = shown.length > 0 && shown.every((fx) => selected.has(fx.externalId));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allShownSelected) {
        // Only clear the ones currently visible — a filter change shouldn't
        // silently drop picks the admin already made outside the filter.
        const next = new Set(prev);
        for (const id of shownIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of shownIds) next.add(id);
      return next;
    });
  }

  function handleAddSelected() {
    const picked = results.filter((fx) => selected.has(fx.externalId));
    if (picked.length === 0) return;
    startAdding(async () => {
      const result = await addFixturesBulkAction(picked);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const parts = [`${result.added} jogo${result.added === 1 ? "" : "s"} adicionado${result.added === 1 ? "" : "s"}`];
      if (result.skipped > 0) parts.push(`${result.skipped} ignorado(s) (já existente ou passado)`);
      toast.success(parts.join(" — "));
      setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-border p-4">
      <SectionLabel className="mb-0">
        <Radar className="size-3.5" aria-hidden /> Procurar jogo real (opcional)
      </SectionLabel>
      <p className="-mt-1 text-xs text-muted-foreground">
        Só alcança os próximos ~3 dias (limite do plano gratuito da API). Fora disso, preenche à mão como sempre.
      </p>

      <div className="flex flex-wrap gap-2">
        {DAY_OPTIONS.map((d) => (
          <button
            key={d.offset}
            type="button"
            disabled={isAdding}
            onClick={() => loadDay(d.offset)}
            className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              dayOffset === d.offset ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {d.label} · {localDateStr(d.offset).slice(8, 10)}/{localDateStr(d.offset).slice(5, 7)}
          </button>
        ))}
      </div>

      {dayOffset !== null && (
        <>
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por equipa ou liga..."
              disabled={isAdding || loading}
              className="pr-8"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              {loading ? <Spinner className="size-3.5" /> : <Search className="size-3.5" />}
            </span>
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          {!loading && !error && shown.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum jogo encontrado para este dia.</p>
          )}

          {shown.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={isAdding}
                  onClick={toggleAll}
                  className="press flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      allShownSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {allShownSelected && <Check className="size-3" aria-hidden />}
                  </span>
                  Selecionar todos ({shown.length})
                </button>
                {selected.size > 0 && <span className="text-xs font-semibold text-primary">{selected.size} selecionado(s)</span>}
              </div>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
                {shown.map((fx, i) => {
                  const isChecked = selected.has(fx.externalId);
                  return (
                    <label
                      key={fx.externalId}
                      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent ${
                        i > 0 ? "border-t border-border" : ""
                      } ${isChecked ? "bg-accent/60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isAdding}
                        onChange={() => toggle(fx.externalId)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="flex shrink-0 items-center gap-1">
                        {fx.homeLogoUrl ? (
                          <Image src={fx.homeLogoUrl} alt="" width={18} height={18} unoptimized className="size-[18px] object-contain" />
                        ) : (
                          <span className="size-[18px] rounded-full bg-muted" aria-hidden />
                        )}
                        {fx.awayLogoUrl ? (
                          <Image src={fx.awayLogoUrl} alt="" width={18} height={18} unoptimized className="size-[18px] object-contain" />
                        ) : (
                          <span className="size-[18px] rounded-full bg-muted" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {fx.home} <span className="font-normal text-muted-foreground">vs</span> {fx.away}
                        {fx.isElimination && (
                          <span className="ml-1.5 rounded-full bg-locked-10 px-1.5 py-0.5 text-[9px] font-bold text-locked">ELIMINAÇÃO</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fx.league} · {new Date(fx.kickoffAtIso).toLocaleTimeString("pt", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </label>
                  );
                })}
                {sorted.length > RESULTS_CAP && (
                  <p className="border-t border-border px-3 py-2 text-center text-xs text-muted-foreground">
                    +{sorted.length - RESULTS_CAP} resultados — usa o filtro para ver mais
                  </p>
                )}
              </div>

              <ActionButton
                type="button"
                block
                loading={isAdding}
                disabled={selected.size === 0}
                onClick={handleAddSelected}
                icon={<Check className="size-4" aria-hidden />}
              >
                Adicionar {selected.size > 0 ? `${selected.size} jogo${selected.size === 1 ? "" : "s"}` : "jogos selecionados"}
              </ActionButton>
            </>
          )}
        </>
      )}
    </div>
  );
}
