import Link from "next/link";
import { formatCentsAsMt } from "@/lib/format";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

/** Balance-next-to-name chip — every real betting app keeps this one glance
 *  away at all times, never buried in a separate wallet page. */
export function WalletChip({ availableCents, compact = false }: { availableCents: number; compact?: boolean }) {
  return (
    <Link
      href="/wallet/deposit"
      className={`press flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 font-bold text-success transition-colors hover:bg-success/20 ${
        compact ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"
      }`}
    >
      <span aria-hidden>💰</span>
      {formatCentsAsMt(availableCents)} MT
      <LinkPendingSpinner className="size-3" />
      <span className="text-success/70" aria-hidden>+</span>
    </Link>
  );
}
