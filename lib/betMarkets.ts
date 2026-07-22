/**
 * Single source of truth for every betting market Duelo offers — which
 * (market, prediction) pairs are valid, how a market resolves from a final
 * score, and how to label a prediction for display. Mirrors
 * bet_settle_match's SQL exactly (supabase/migrations/0035_extra_markets.sql)
 * — keep the two in sync if either changes.
 *
 * Before this file existed, "final score → which prediction was correct"
 * was reimplemented independently in 5 places (bet_settle_match, two spots
 * in lib/bets.ts, lib/profile.ts, and implicitly in bets-list.tsx) — a real
 * drift risk even before these new markets existed. Every one of those now
 * calls into resolveOutcome below instead.
 */

export type Market = "1x2" | "total_goals" | "btts";

/** The only lines offered for total_goals — a fixed, small set rather than
 *  free input, so there's never an ambiguous or vendor-unsupported line to
 *  validate. Half-point on purpose: a combined goal count can never equal
 *  1.5/2.5/3.5 exactly, so over/under always produces a real winner —
 *  no "neither side called it" refund case exists for this market. */
export const TOTAL_GOALS_LINES = [1.5, 2.5, 3.5] as const;
export type TotalGoalsLine = (typeof TOTAL_GOALS_LINES)[number];

export const MARKET_LABEL: Record<Market, string> = {
  "1x2": "Resultado",
  total_goals: "Total de Golos",
  btts: "Ambas Marcam",
};

/**
 * Every final-score outcome a market can resolve to. Returns null only for
 * the structurally-unreachable "line falls exactly on the total" case
 * (can't happen with the X.5 lines above) — defensive, mirrors the SQL's
 * own defensive `else v_actual := null`.
 */
export function resolveOutcome(market: Market, line: number | null, resultHome: number, resultAway: number): string | null {
  if (market === "total_goals") {
    const total = resultHome + resultAway;
    if (line == null) return null;
    if (total > line) return "over";
    if (total < line) return "under";
    return null;
  }
  if (market === "btts") {
    return resultHome > 0 && resultAway > 0 ? "yes" : "no";
  }
  // '1x2'
  if (resultHome > resultAway) return "home";
  if (resultHome < resultAway) return "away";
  return "draw";
}

/** Every valid prediction value for a market, in the order they should be
 *  offered — used both to validate input and to drive the option-chip UI.
 *  `isElimination` drops 'draw' for 1x2 (a knockout fixture always produces
 *  a winner) — irrelevant for the other two markets, which have no draw
 *  concept at all. */
export function marketPredictions(market: Market, isElimination = false): string[] {
  if (market === "total_goals") return ["over", "under"];
  if (market === "btts") return ["yes", "no"];
  return isElimination ? ["home", "away"] : ["home", "draw", "away"];
}

function formatLine(line: number | null): string {
  return line != null ? line.toFixed(1) : "";
}

/** Full-sentence label for a prediction, the way it's shown everywhere a
 *  bet's pick needs to read as a complete thought (feed row, receipt
 *  ticket stub, "Minhas Apostas" list) — not just a market name. */
export function marketLabel(market: Market, prediction: string, line: number | null, homeTeam: string, awayTeam: string): string {
  if (market === "total_goals") {
    const l = formatLine(line);
    return prediction === "over" ? `Mais de ${l} golos` : `Menos de ${l} golos`;
  }
  if (market === "btts") {
    return prediction === "yes" ? "Ambas marcam" : "Uma equipa não marca";
  }
  // '1x2'
  if (prediction === "home") return `${homeTeam} ganha`;
  if (prediction === "away") return `${awayTeam} ganha`;
  return "Empate";
}

/** Short badge code — the "1"/"X"/"2" chip already used for 1x2, extended
 *  to the new markets. Purely cosmetic (option-card badges, the ticket
 *  stub's result chip before a match has a score yet). */
export function marketShortCode(market: Market, prediction: string, line: number | null): string {
  if (market === "total_goals") {
    const l = formatLine(line);
    return prediction === "over" ? `+${l}` : `-${l}`;
  }
  if (market === "btts") {
    return prediction === "yes" ? "SIM" : "NÃO";
  }
  if (prediction === "home") return "1";
  if (prediction === "away") return "2";
  return "X";
}
