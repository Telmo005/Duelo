import Link from "next/link";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

function navItems(loggedIn: boolean) {
  return [
    { icon: "🏠", label: "Feed", active: true, href: "/", tint: "#F2C22A" },
    { icon: "🎯", label: "Minhas Apostas", href: loggedIn ? "/bets" : "/register", tint: "#EC4899" },
    { icon: "💳", label: "Carteira", href: loggedIn ? "/dashboard" : "/register", tint: "#3B82F6" },
    { icon: "👤", label: "Perfil", href: loggedIn ? "/perfil" : "/register", tint: "#8B5CF6" },
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
          {navItems(loggedIn).map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] font-semibold transition-colors ${
                item.active ? "bg-accent text-primary" : "text-foreground hover:bg-accent"
              }`}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-base"
                style={{ background: `${item.tint}26` }}
                aria-hidden
              >
                {item.icon}
              </span>
              {item.label}
              <LinkPendingSpinner />
            </Link>
          ))}
        </nav>

        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Agora mesmo</p>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">🔥 Duelos abertos</span>
              <span className="font-bold">{openCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">📈 Em jogo</span>
              <span className="font-bold">{potTotal}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">✅ Pago automaticamente</span>
              <span className="font-bold text-success">100%</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
