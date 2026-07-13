import Link from "next/link";
import { House, Wallet, Swords, User, Plus, type LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { WalletChip } from "@/components/wallet/wallet-chip";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { FeedListener } from "@/components/realtime/feed-listener";
import { AvatarMenu } from "@/components/layout/avatar-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { MobileTabBar, type TabKey } from "@/components/layout/mobile-tab-bar";
import { actionButtonVariants } from "@/components/ui/action-button";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const NAV: { label: string; href: string; icon: LucideIcon; key: TabKey }[] = [
  { label: "Feed", href: "/", icon: House, key: "feed" },
  { label: "Apostas", href: "/bets", icon: Swords, key: "bets" },
  { label: "Carteira", href: "/dashboard", icon: Wallet, key: "wallet" },
  { label: "Perfil", href: "/perfil", icon: User, key: "profile" },
];

export async function AppShell({
  active,
  displayName,
  availableCents,
  currentUserId,
  children,
}: {
  active: TabKey;
  displayName: string;
  availableCents: number;
  currentUserId?: string;
  children: React.ReactNode;
}) {
  const initial = displayName.charAt(0).toUpperCase();
  const unreadCount = currentUserId ? await getUnreadNotificationCount(currentUserId) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <FeedListener currentUserId={currentUserId} />

      {/* ── Sidebar (desktop) ─────────────────────────────────── */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-between lg:border-r lg:border-border lg:bg-card lg:p-6">
        <div>
          <Link href="/" className="text-lg font-extrabold tracking-tight text-primary">
            Duelo
          </Link>

          <div className="mt-5 flex items-center gap-2">
            <WalletChip availableCents={availableCents} />
            <NotificationBell unreadCount={unreadCount} />
          </div>

          <nav className="mt-6 flex flex-col gap-1">
            {NAV.map(({ label, href, icon: Icon, key }) => {
              const isActive = key === active;
              return (
                <Link
                  key={key}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-primary-10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                  {label}
                  <LinkPendingSpinner />
                </Link>
              );
            })}
          </nav>

          <Link
            href="/bets/new"
            className={cn(actionButtonVariants({ variant: "primary", size: "md", block: true }), "mt-5")}
          >
            <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
            Criar aposta
            <LinkPendingSpinner />
          </Link>
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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:hidden">
          <Link href="/" className="shrink-0 text-lg font-extrabold tracking-tight text-primary">
            Duelo
          </Link>
          <div className="flex items-center gap-2">
            <WalletChip availableCents={availableCents} compact />
            <NotificationBell unreadCount={unreadCount} compact />
            <AvatarMenu displayName={displayName} />
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-5 pb-28 pt-6 sm:px-8 lg:px-10 lg:py-10">{children}</div>
      </div>

      <MobileTabBar active={active} />
    </div>
  );
}
