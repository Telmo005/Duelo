"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCentsAsMt } from "@/lib/format";
import type { getAffiliateOverview } from "@/lib/adminData"; // type-only — never bundled into the client

type SortMode = "earned" | "referred" | "balance";
const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "earned", label: "Mais ganho" },
  { key: "referred", label: "Mais referidos" },
  { key: "balance", label: "Saldo" },
];

type Row = Awaited<ReturnType<typeof getAffiliateOverview>>[number];

/** Search + sort wrapper over the affiliate overview table, same pattern
 *  as components/admin/scheduled-matches-list.tsx — data fetched
 *  unfiltered server-side, filtered/sorted client-side (this list is
 *  bounded by "users who have ever earned a referral payout", nowhere
 *  near the size that would need server-side pagination). */
export function AffiliateOverviewList({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("earned");

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((r) => `${r.displayName} ${r.phone ?? ""} ${r.referralCode}`.toLowerCase().includes(needle))
    : rows;

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sort === "referred") return copy.sort((a, b) => b.referredCount - a.referredCount);
    if (sort === "balance") return copy.sort((a, b) => b.availableCents - a.availableCents);
    return copy.sort((a, b) => b.totalEarnedCents - a.totalEarnedCents);
  }, [filtered, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar nome, telefone ou código..." className="pr-8" />
          <Search className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        </div>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSort(opt.key)}
              className={`press shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                sort === opt.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Nenhum afiliado encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {sorted.map((r) => (
            <div key={r.userId} className="flex items-center justify-between gap-3 border-b border-border p-3.5 text-sm last:border-b-0">
              <div className="min-w-0">
                <p className="truncate font-bold">{r.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {r.phone ?? "—"} · {r.referralCode} · {r.referredCount} referido{r.referredCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs">
                <p><span className="font-bold text-success-text">{formatCentsAsMt(r.totalEarnedCents)} MT</span> ganho</p>
                <p className="text-muted-foreground">{formatCentsAsMt(r.availableCents)} MT em saldo</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
