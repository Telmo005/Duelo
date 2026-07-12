import Link from "next/link";
import { Wallet, Plus } from "lucide-react";
import { formatCentsAsMt } from "@/lib/format";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

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
      <LinkPendingSpinner className="size-3" />
      <Plus className="size-3.5 text-success/70" strokeWidth={2.6} aria-hidden />
    </Link>
  );
}
