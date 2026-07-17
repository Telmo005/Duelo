"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Handshake, Trophy, HeartCrack, RotateCcw, ArrowUpFromLine, ArrowDownToLine, Bell, type LucideIcon } from "lucide-react";
import { markNotificationReadAction } from "@/lib/actions/notifications";
import { Spinner } from "@/components/ui/spinner";
import type { Notification } from "@/db/schema";

const TYPE_ICON: Record<string, { Icon: LucideIcon; tint: string }> = {
  bet_accepted: { Icon: Handshake, tint: "#F2C22A" },
  bet_won: { Icon: Trophy, tint: "#34D399" },
  bet_lost: { Icon: HeartCrack, tint: "#F0455B" },
  bet_refunded: { Icon: RotateCcw, tint: "#3B82F6" },
  withdrawal_pending: { Icon: ArrowUpFromLine, tint: "#9C98F7" },
  withdrawal_completed: { Icon: ArrowUpFromLine, tint: "#34D399" },
  withdrawal_rejected: { Icon: ArrowUpFromLine, tint: "#F0455B" },
  deposit_success: { Icon: ArrowDownToLine, tint: "#34D399" },
  deposit_failed: { Icon: ArrowDownToLine, tint: "#F0455B" },
};

export function NotificationItem({ notification }: { notification: Notification }) {
  const isUnread = !notification.readAt;
  const meta = TYPE_ICON[notification.type] ?? { Icon: Bell, tint: "#94A3B8" };
  const Icon = meta.Icon;
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isUnread) startTransition(async () => { await markNotificationReadAction(notification.id); });
  }

  const content = (
    <>
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${meta.tint}22`, color: meta.tint }}
        aria-hidden
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${isUnread ? "font-extrabold" : "font-bold text-muted-foreground"}`}>{notification.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.body}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {new Date(notification.createdAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </div>
      {isUnread && (isPending ? <Spinner className="size-3 shrink-0" /> : <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />)}
    </>
  );

  const className = `press flex items-start gap-3 px-4 py-3.5 transition-colors ${isUnread ? "bg-primary-10" : ""} hover:bg-accent`;

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={handleClick} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={`w-full text-left ${className}`}>
      {content}
    </button>
  );
}
