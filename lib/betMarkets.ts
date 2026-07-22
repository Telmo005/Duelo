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

/** Which emoji represents each market — shared between the market-picker
 *  step (create-bet-form.tsx), the "choose your side" step and ticket stub
 *  (bet-receipt-card.tsx), and the small inline marker on every feed row
 *  (duel-post.tsx), so the same market always reads as the same glyph
 *  everywhere instead of drifting between spots. Real emoji rather than a
 *  monochrome icon set on purpose — they're inherently full-colour (no
 *  per-market accent colour to pick or keep in sync) and instantly
 *  recognisable at the small sizes a feed row allows. */
export const MARKET_EMOJI: Record<Market, string> = {
  "1x2": "🏆",
  total_goals: "⚽",
  btts: "🤝",
};

/** Whether a market's emoji needs a CSS grayscale filter to read as a
 *  classic black-and-white ball rather than whatever colour the platform's
 *  emoji font happens to render ⚽ in (blue-and-white on some Windows
 *  builds) — the app can't control emoji glyph design, only desaturate it.
 *  Every consumer that renders MARKET_EMOJI applies `grayscale` when this is
 *  true. */
export const MARKET_EMOJI_GRAYSCALE: Record<Market, boolean> = {
  "1x2": false,
  total_goals: true,
  btts: false,
};

/** Which accent colour represents each market — same sharing rationale as
 *  MARKET_ICON above (feed row, market-picker step, and the "choose your
 *  side" acceptance step all use this so a market reads as the same colour
 *  everywhere). Semantic keys, not Tailwind classes, on purpose: this file
 *  stays framework-free, and the concrete class needed differs by spot
 *  (icon-only text colour in the feed vs. a tinted badge background in the
 *  wizard) — each consumer maps these to its own classes. Reuses the app's
 *  existing primary/success/locked tokens rather than introducing new ones. */
export const MARKET_ACCENT: Record<Market, "primary" | "success" | "locked"> = {
  "1x2": "primary",
  total_goals: "success",
  btts: "locked",
};

/** One-line plain-language explanation of each market — shown right under
 *  the market's name wherever it's picked, since the name alone ("Total de
 *  Golos", "Ambas Marcam") doesn't tell a first-time bettor what they're
 *  actually predicting. */
export const MARKET_DESCRIPTION: Record<Market, string> = {
  "1x2": "Quem ganha o jogo, ou empate",
  total_goals: "Se o jogo tem mais ou menos golos que uma linha",
  btts: "Se as duas equipas marcam golo",
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
