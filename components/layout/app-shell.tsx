import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { WalletChip } from "@/components/wallet/wallet-chip";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { FeedListener } from "@/components/realtime/feed-listener";

const NAV_ITEMS = (active: string) => [
  { label: "Feed", href: "/", icon: "🏠", key: "feed" },
  { label: "Carteira", href: "/dashboard", icon: "💳", key: "wallet" },
  { label: "Apostas", href: "/bets", icon: "🎯", key: "bets" },
  { label: "Perfil", href: "/perfil", icon: "👤", key: "profile" },
].map((item) => ({ ...item, active: item.key === active }));

export function AppShell({
  active,
  displayName,
  availableCents,
  currentUserId,
  children,
}: {
  active: "feed" | "wallet" | "bets" | "profile";
  displayName: string;
  availableCents: number;
  currentUserId?: string;
  children: React.ReactNode;
}) {
  const initial = displayName.charAt(0).toUpperCase();
  const navItems = NAV_ITEMS(active);

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <FeedListener currentUserId={currentUserId} />
      {/* ── Sidebar (desktop) ─────────────────────────────────── */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-between lg:border-r lg:border-border lg:bg-card lg:p-6">
        <div>
          <span className="text-lg font-extrabold tracking-tight text-primary">Duelo</span>

          <div className="mt-5">
            <WalletChip availableCents={availableCents} />
          </div>

          <nav className="mt-6 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  item.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
                <LinkPendingSpinner />
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{displayName}</p>
            <SignOutButton className="text-xs text-muted-foreground hover:text-foreground" />
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="flex-1">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden">
          <span className="shrink-0 text-lg font-extrabold tracking-tight text-primary">Duelo</span>
          <div className="flex items-center gap-2.5">
            <WalletChip availableCents={availableCents} compact />
            <Link
              href="/perfil"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
              aria-label={`Perfil de ${displayName}`}
            >
              {initial}
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8 lg:px-10 lg:py-10">{children}</div>

        {/* Sign out (mobile) */}
        <div className="mx-auto max-w-5xl border-t border-border px-5 pb-10 pt-5 sm:px-8 lg:hidden">
          <SignOutButton id="signout-btn" className="text-sm text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
