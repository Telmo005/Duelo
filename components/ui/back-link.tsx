import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A "back" affordance with a fixed, predictable destination. We deliberately
 * do NOT use router.back() here: on a P2P app users arrive at a page from many
 * places (a link, a redirect, a notification, a hard refresh), and history-back
 * could bounce them out of the app entirely or somewhere unexpected. A plain
 * link to the known parent always lands where the user expects, and still works
 * with middle-click / no-JS.
 */
export function BackLink({
  href,
  label = "Voltar",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ChevronLeft className="size-4" strokeWidth={2.2} aria-hidden />
      {label}
    </Link>
  );
}
