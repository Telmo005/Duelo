"use client";

import { useState } from "react";
import type { UserBetRow } from "@/lib/profile";
import { formatCentsAsMt } from "@/lib/format";

const TABS = [
  { key: "all", label: "Todas" },
  { key: "waiting", label: "Aguardam" },
  { key: "matched", label: "Em curso" },
  { key: "done", label: "Concluídas" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function matchesTab(bet: UserBetRow, tab: TabKey) {
  if (tab === "all") return true;
  if (tab === "waiting") return bet.status === "waiting";
  if (tab === "matched") return bet.status === "matched";
  return bet.status === "settled" || bet.status === "cancelled" || bet.status === "refunded";
}

function statusMeta(bet: UserBetRow) {
  if (bet.status === "waiting") return { label: "Aguarda adversário", className: "bg-primary/10 text-primary" };
  if (bet.status === "matched") return { label: "Em curso", className: "bg-success/10 text-success" };
  if (bet.status === "cancelled") return { label: "Cancelada", className: "bg-muted text-muted-foreground" };
  if (bet.status === "refunded") return { label: "Reembolsada", className: "bg-locked/10 text-locked" };
  if (bet.won === true) return { label: "Ganhaste", className: "bg-success/10 text-success" };
  if (bet.won === false) return { label: "Perdeste", className: "bg-destructive/10 text-destructive" };
  return { label: "Liquidada", className: "bg-muted text-muted-foreground" };
}

function predictionLabel(bet: UserBetRow) {
  const pick = bet.prediction === "home" ? bet.matchHome : bet.prediction === "away" ? bet.matchAway : "Empate";
  return bet.isCreator ? pick : `Contra: ${pick}`;
}

const BORDER_COLOR: Record<string, string> = {
  waiting: "bg-primary",
  matched: "bg-success",
  cancelled: "bg-muted-foreground/40",
  refunded: "bg-locked",
  settled: "bg-success",
};

export function BetsList({ bets }: { bets: UserBetRow[] }) {
  const [tab, setTab] = useState<TabKey>("all");
  const filtered = bets.filter((b) => matchesTab(b, tab));

  return (
    <div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 py-10 text-center">
          <div className="mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-muted text-2xl" aria-hidden>🎯</div>
          <p className="mb-1 text-base font-bold">Sem apostas aqui</p>
          <p className="text-sm text-muted-foreground">As apostas nesta categoria vão aparecer aqui.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((bet) => {
            const s = statusMeta(bet);
            return (
              <div key={bet.id} className="relative overflow-hidden rounded-2xl border border-border bg-card p-4">
                <div className={`absolute inset-y-0 left-0 w-1 ${BORDER_COLOR[bet.status] ?? "bg-muted-foreground/40"}`} aria-hidden />
                <div className="flex items-start justify-between gap-3 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {bet.matchHome} vs {bet.matchAway}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {bet.league} · {new Date(bet.kickoffAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold">{predictionLabel(bet)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {bet.opponentName ? `vs ${bet.opponentName}` : "Sem adversário ainda"} · {formatCentsAsMt(bet.stakeCents)} MT
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.className}`}>{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
