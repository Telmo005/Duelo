import Link from "next/link";
import { House, Swords, Wallet, User, Flame, TrendingUp, ShieldCheck, type LucideIcon } from "lucide-react";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { cn } from "@/lib/utils";

function navItems(loggedIn: boolean): { icon: LucideIcon; label: string; active?: boolean; href: string }[] {
  return [
    { icon: House, label: "Feed", active: true, href: "/" },
    { icon: Swords, label: "Minhas Apostas", href: loggedIn ? "/bets" : "/register" },
    { icon: Wallet, label: "Carteira", href: loggedIn ? "/dashboard" : "/register" },
    { icon: User, label: "Perfil", href: loggedIn ? "/perfil" : "/register" },
  ];
}

export function FeedSidebarLeft({
  openCount,
  potTotal,
  loggedIn = false,
}: {
  openCount: number;
  potTotal: string;
  loggedIn?: boolean;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[76px] flex flex-col gap-4">
        <nav className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-card)]">
          {navItems(loggedIn).map(({ icon: Icon, label, active, href }) => (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-semibold transition-colors",
                active ? "bg-accent text-primary" : "text-foreground hover:bg-accent"
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              {label}
              <LinkPendingSpinner />
            </Link>
          ))}
        </nav>

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Agora mesmo</p>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Flame className="size-4" aria-hidden /> Duelos ativos
              </span>
              <span className="font-bold tabular-nums">{openCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="size-4" aria-hidden /> Em jogo
              </span>
              <span className="font-bold tabular-nums">{potTotal}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-4" aria-hidden /> Pago automaticamente
              </span>
              <span className="font-bold text-success">100%</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
