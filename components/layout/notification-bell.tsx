import Link from "next/link";
import { Bell } from "lucide-react";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";

/** Unread count is fetched server-side by AppShell on every navigation —
 *  no realtime socket for this yet, but in a mobile app users move between
 *  pages constantly, so the badge rarely stays stale for long. */
export function NotificationBell({ unreadCount, compact = false }: { unreadCount: number; compact?: boolean }) {
  const hasUnread = unreadCount > 0;

  return (
    <Link
      href="/notifications"
      aria-label={hasUnread ? `Notificações — ${unreadCount} por ler` : "Notificações"}
      className={`press relative flex shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent ${
        compact ? "size-9" : "size-10"
      }`}
    >
      <Bell className={compact ? "size-4" : "size-[18px]"} aria-hidden />
      {hasUnread && (
        <span
          className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-extrabold leading-none text-destructive-foreground"
          aria-hidden
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
      <LinkPendingSpinner className="absolute -bottom-1 size-2.5" />
    </Link>
  );
}
