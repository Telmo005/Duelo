"use client";

import Link, { useLinkStatus } from "next/link";
import { Wallet, Plus } from "lucide-react";
import { formatCentsAsMt } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";

/** Swaps the trailing "+" for a spinner while the navigation it triggers is
 *  in flight. Replacing an existing icon reads as an obvious state change;
 *  an extra spinner squeezed in alongside everything else was too easy to
 *  miss, especially on the compact/mobile variant. */
function TrailingIcon({ compact }: { compact: boolean }) {
  const { pending } = useLinkStatus();
  if (pending) return <Spinner className={compact ? "size-3" : "size-3.5"} />;
  return <Plus className="size-3.5 text-success/70" strokeWidth={2.6} aria-hidden />;
}

/** Balance-next-to-name chip — every real betting app keeps this one glance
 *  away at all times, never buried in a separate wallet page. */
export function WalletChip({ availableCents, compact = false }: { availableCents: number; compact?: boolean }) {
  return (
    <Link
      href="/wallet/deposit"
      aria-label="Depositar"
      className={`press flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-success-25 bg-success-10 font-bold text-success transition-colors hover:bg-success-20 ${
        compact ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"
      }`}
    >
      <Wallet className={compact ? "size-3.5" : "size-4"} aria-hidden />
      {formatCentsAsMt(availableCents)} MT
      <TrailingIcon compact={compact} />
    </Link>
  );
}
