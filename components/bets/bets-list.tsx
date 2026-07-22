"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Swords } from "lucide-react";
import type { UserBetRow, UserBetsTab } from "@/lib/profile";
import { getUserBetsPageAction } from "@/lib/actions/profile";
import { formatCentsAsMt, MOZAMBIQUE_TIMEZONE } from "@/lib/format";
import { marketLabel, type Market } from "@/lib/betMarkets";
import { Spinner } from "@/components/ui/spinner";

const TABS: { key: UserBetsTab; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "waiting", label: "Aguardam" },
  { key: "matched", label: "Em curso" },
  { key: "done", label: "Concluídas" },
];

function statusMeta(bet: UserBetRow) {
  if (bet.status === "waiting") return { label: "Aguarda adversário", className: "bg-primary-10 text-primary" };
  if (bet.status === "matched") return { label: "Em curso", className: "bg-success-10 text-success" };
  if (bet.status === "cancelled") return { label: "Cancelada", className: "bg-muted text-muted-foreground" };
  if (bet.status === "refunded") return { label: "Reembolsada", className: "bg-locked-10 text-locked" };
  if (bet.won === true) return { label: "Ganhaste", className: "bg-success-10 text-success" };
  if (bet.won === false) return { label: "Perdeste", className: "bg-destructive-10 text-destructive" };
  return { label: "Liquidada", className: "bg-muted text-muted-foreground" };
}

function predictionLabel(bet: UserBetRow) {
  const pick = marketLabel(bet.market as Market, bet.prediction, bet.line, bet.matchHome, bet.matchAway);
  return bet.isCreator ? pick : `Contra: ${pick}`;
}

const BORDER_COLOR: Record<string, string> = {
  waiting: "bg-primary",
  matched: "bg-success",
  cancelled: "bg-muted-foreground/40",
  refunded: "bg-locked",
  settled: "bg-success",
};

/** Each tab (Todas/Aguardam/Em curso/Concluídas) is its own filtered,
 *  cursor-paginated server query (see getUserBets) — switching tabs
 *  refetches from scratch rather than filtering one giant preloaded array,
 *  so a tab never silently misses bets that fell outside whatever had
 *  already been fetched. The "all" tab starts from the page the server
 *  component already fetched, so the first render needs no extra request. */
export function BetsList({
  initialItems,
  initialNextCursor,
}: {
  initialItems: UserBetRow[];
  initialNextCursor: string | null;
}) {
  const [tab, setTab] = useState<UserBetsTab>("all");
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isPending, startTransition] = useTransition();

  function switchTab(next: UserBetsTab) {
    if (next === tab) return;
    setTab(next);
    startTransition(async () => {
      const page = await getUserBetsPageAction(next);
      setItems(page.items);
      setNextCursor(page.nextCursor);
    });
  }

  function loadMore() {
    if (!nextCursor) return;
    startTransition(async () => {
      const page = await getUserBetsPageAction(tab, nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    });
  }

  return (
    <div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 py-10 text-center">
          <div className="mb-4 flex size-13 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
            {isPending ? <Spinner className="size-6" /> : <Swords className="size-6" />}
          </div>
          <p className="mb-1 text-base font-bold">{isPending ? "A carregar…" : "Sem apostas aqui"}</p>
          {!isPending && <p className="text-sm text-muted-foreground">As apostas nesta categoria vão aparecer aqui.</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {items.map((bet) => {
              const s = statusMeta(bet);
              return (
                <Link
                  key={bet.id}
                  href={`/d/${bet.id}`}
                  className="press relative block overflow-hidden rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary-40 hover:bg-accent"
                >
                  <div className={`absolute inset-y-0 left-0 w-1 ${BORDER_COLOR[bet.status] ?? "bg-muted-foreground/40"}`} aria-hidden />
                  <div className="flex items-start justify-between gap-3 pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {bet.matchHome} vs {bet.matchAway}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {bet.league} · {new Date(bet.kickoffAt).toLocaleString("pt", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: MOZAMBIQUE_TIMEZONE })}
                      </p>
                      <p className="mt-1.5 text-sm font-semibold">{predictionLabel(bet)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {bet.opponentName ? `vs ${bet.opponentName}` : "Sem adversário ainda"} · {formatCentsAsMt(bet.stakeCents)} MT
                      </p>
                      <p className="mt-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground/70">{bet.reference}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.className}`}>{s.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          {nextCursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={isPending}
              className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {isPending ? <Spinner className="size-4" /> : null}
              {isPending ? "A carregar…" : "Carregar mais"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
