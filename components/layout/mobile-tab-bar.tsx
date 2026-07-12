import Link from "next/link";
import { House, Swords, Plus, Wallet, User, type LucideIcon } from "lucide-react";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { cn } from "@/lib/utils";

export type TabKey = "feed" | "bets" | "wallet" | "profile";

/**
 * The single bottom navigation for mobile — used on EVERY authenticated
 * screen (feed, wallet, bets, profile) via AppShell and on the public feed.
 * Before this, only the feed had a bottom bar; the wallet/bets/profile pages
 * had none, so on a phone there was no in-app way back to the feed — the
 * browser back button was the only escape. This bar is that missing map.
 */
export function MobileTabBar({ active, loggedIn = true }: { active?: TabKey; loggedIn?: boolean }) {
  const href = (authed: string) => (loggedIn ? authed : "/register");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-[1200px] items-stretch justify-around px-2">
        <Tab href="/" icon={House} label="Feed" active={active === "feed"} />
        <Tab href={href("/bets")} icon={Swords} label="Apostas" active={active === "bets"} />
        <CreateTab href={href("/bets/new")} />
        <Tab href={href("/dashboard")} icon={Wallet} label="Carteira" active={active === "wallet"} />
        <Tab href={href("/perfil")} icon={User} label="Perfil" active={active === "profile"} />
      </div>
    </nav>
  );
}

function Tab({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
      <span className="flex items-center gap-1">
        {label}
        <LinkPendingSpinner className="size-2.5" />
      </span>
    </Link>
  );
}

/** The center "create bet" affordance — an elevated gold pill that pops above
 *  the bar, the app's single most important action. */
function CreateTab({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Criar aposta"
      className="press flex flex-1 flex-col items-center justify-start"
    >
      <span className="-mt-4 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] ring-4 ring-background">
        <Plus className="size-6" strokeWidth={2.6} aria-hidden />
      </span>
      <span className="mt-0.5 text-[10px] font-bold text-primary">Criar</span>
    </Link>
  );
}
