import Link from "next/link";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

function items(loggedIn: boolean) {
  return [
    { href: "/", icon: "🏠", label: "Feed", active: true },
    { href: "#feed", icon: "🔥", label: "Em alta" },
    { href: loggedIn ? "/bets/new" : "/register", icon: "➕", label: "Criar", cta: true },
    { href: loggedIn ? "/dashboard" : "/register", icon: "💳", label: "Carteira" },
    { href: loggedIn ? "/perfil" : "/register", icon: "👤", label: "Perfil" },
  ];
}

export function BottomNav({ loggedIn = false }: { loggedIn?: boolean }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm lg:hidden">
      <div className="mx-auto flex max-w-[1200px] items-center justify-around px-2 py-1.5">
        {items(loggedIn).map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold ${
              item.cta
                ? "-mt-4 rounded-full bg-primary p-3 text-primary-foreground shadow-[var(--shadow-elevated)]"
                : item.active
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <span className={item.cta ? "text-lg" : "text-lg leading-none"} aria-hidden>
              {item.icon}
            </span>
            {!item.cta && (
              <span className="flex items-center gap-1">
                {item.label}
                <LinkPendingSpinner className="size-2.5" />
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
