import Link from "next/link";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

export function Composer({ href = "/register" }: { href?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <Link href={href} className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#3B82F6] text-xl font-bold text-white"
          style={{ boxShadow: "0 0 16px rgba(59,130,246,0.55)" }}
          aria-hidden
        >
          +
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-[15px] text-muted-foreground transition-colors hover:bg-secondary">
          Criar Nova Aposta
          <LinkPendingSpinner />
        </div>
      </Link>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Link
          href={href}
          className="flex flex-1 items-center gap-2.5 rounded-lg border border-border bg-muted/40 py-2 pl-2.5 pr-3 text-sm font-bold transition-colors hover:bg-accent"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#3B82F6] text-sm text-white"
            style={{ boxShadow: "0 0 12px rgba(59,130,246,0.55)" }}
            aria-hidden
          >
            +
          </span>
          Nova Aposta
          <LinkPendingSpinner />
        </Link>
        <Link
          href="#feed"
          className="flex flex-1 items-center gap-2.5 rounded-lg border border-border bg-muted/40 py-2 pl-2.5 pr-3 text-sm font-bold transition-colors hover:bg-accent"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F2622E] text-sm"
            style={{ boxShadow: "0 0 12px rgba(242,98,46,0.55)" }}
            aria-hidden
          >
            🔥
          </span>
          Tendências
          <LinkPendingSpinner />
        </Link>
      </div>
    </div>
  );
}
