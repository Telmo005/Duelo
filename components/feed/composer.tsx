import Link from "next/link";
import { Plus } from "lucide-react";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

/** The "start a bet" prompt at the top of the feed — a single, unambiguous
 *  entry point to the create-bet flow (no decorative dead links). */
export function Composer({ href = "/register" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="press flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] transition-colors hover:bg-accent"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-elevated)]"
        aria-hidden
      >
        <Plus className="size-6" strokeWidth={2.6} />
      </span>
      <span className="flex flex-1 items-center justify-between gap-2 rounded-full bg-muted px-4 py-3 text-[15px] font-semibold text-muted-foreground">
        Criar nova aposta
        <LinkPendingSpinner />
      </span>
    </Link>
  );
}
