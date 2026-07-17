"use client";

import { useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Lock, RotateCcw, Trophy, HeartCrack, ChartColumn, type LucideIcon } from "lucide-react";
import { describeLedgerEntry } from "@/lib/ledger-format";
import { formatCentsAsMt } from "@/lib/format";
import { getMoreWalletLedgerAction } from "@/lib/actions/wallet";
import { Spinner } from "@/components/ui/spinner";
import type { WalletLedgerEntry } from "@/db/schema";

const LEDGER_ICON: Record<string, { Icon: LucideIcon; tint: string }> = {
  deposit: { Icon: ArrowDownToLine, tint: "#34D399" },
  hold: { Icon: Lock, tint: "#94A3B8" },
  release: { Icon: RotateCcw, tint: "#3B82F6" },
  settle_win: { Icon: Trophy, tint: "#34D399" },
  settle_loss: { Icon: HeartCrack, tint: "#F0455B" },
  withdrawal_hold: { Icon: ArrowUpFromLine, tint: "#9C98F7" },
  withdrawal_release: { Icon: RotateCcw, tint: "#3B82F6" },
  withdrawal_complete: { Icon: ArrowUpFromLine, tint: "#94A3B8" },
};

function LedgerRow({ entry, bordered }: { entry: WalletLedgerEntry; bordered: boolean }) {
  const { label, netCents } = describeLedgerEntry(entry);
  const isPositive = netCents > 0;
  const meta = LEDGER_ICON[entry.type] ?? { Icon: ChartColumn, tint: "#94A3B8" };
  const Icon = meta.Icon;
  return (
    <div className={`flex items-center gap-3 px-5 py-4 ${bordered ? "border-t border-border" : ""}`}>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${meta.tint}22`, color: meta.tint }}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {new Date(entry.createdAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
          {entry.description ? ` · ${entry.description}` : ""}
        </p>
      </div>
      <p className={`shrink-0 text-sm font-extrabold tabular-nums ${isPositive ? "text-success" : "text-muted-foreground"}`}>
        {isPositive ? "+" : ""}
        {formatCentsAsMt(netCents)} MT
      </p>
    </div>
  );
}

/** Renders the first page (fetched server-side, so it's part of the initial
 *  HTML) and takes over from there with a plain "Carregar mais" button —
 *  no infinite scroll, no new dependency, consistent with the rest of the
 *  app. Each extra page is fetched via a server action scoped to the
 *  caller's own session (see lib/actions/wallet.ts), never a client-passed
 *  userId. */
export function WalletLedgerList({
  initialItems,
  initialNextCursor,
}: {
  initialItems: WalletLedgerEntry[];
  initialNextCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isPending, startTransition] = useTransition();

  function loadMore() {
    if (!nextCursor) return;
    startTransition(async () => {
      const page = await getMoreWalletLedgerAction(nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((entry, i) => (
        <LedgerRow key={entry.id} entry={entry} bordered={i > 0} />
      ))}

      {nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isPending}
          className="press flex w-full items-center justify-center gap-2 border-t border-border py-3.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {isPending ? <Spinner className="size-4" /> : null}
          {isPending ? "A carregar…" : "Carregar mais"}
        </button>
      )}
    </div>
  );
}
