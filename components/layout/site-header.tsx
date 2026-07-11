import Link from "next/link";
import { WalletChip } from "@/components/wallet/wallet-chip";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

export function SiteHeader({ displayName, availableCents }: { displayName?: string; availableCents?: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
          Duelo
        </Link>

        {displayName ? (
          <div className="flex items-center gap-2.5">
            {availableCents != null && <WalletChip availableCents={availableCents} compact />}
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="hidden text-sm font-semibold sm:inline">{displayName}</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold text-foreground transition-colors hover:bg-accent sm:px-4"
            >
              Entrar
              <LinkPendingSpinner />
            </Link>
            <Link
              href="/register"
              className="press flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4"
            >
              Criar conta
              <LinkPendingSpinner />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
