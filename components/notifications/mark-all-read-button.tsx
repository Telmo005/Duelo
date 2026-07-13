"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markNotificationReadAction } from "@/lib/actions/notifications";
import { Spinner } from "@/components/ui/spinner";

export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markNotificationReadAction();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="press flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? <Spinner className="size-3" /> : <CheckCheck className="size-3.5" aria-hidden />}
      Marcar tudo como lido
    </button>
  );
}
