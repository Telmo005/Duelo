"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { clearErrorsAction } from "@/lib/actions/errors";
import { Spinner } from "@/components/ui/spinner";

/** Two-tap confirm (same pattern as delete-match/delete-user buttons) since
 *  this wipes the whole error_log table — no per-row selection, it's an
 *  "I've read these, reset the list" action, not something to fire by
 *  accident on a stray click. */
export function ClearErrorsButton() {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await clearErrorsAction();
      if (result.error) toast.error(result.error);
      else toast.success("Erros limpos");
      setConfirming(false);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`press inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        confirming ? "border-destructive bg-destructive-10 text-destructive" : "border-border hover:bg-accent"
      }`}
    >
      {isPending ? <Spinner className="size-4" /> : <Trash2 className="size-4" aria-hidden />}
      {isPending ? "A limpar…" : confirming ? "Confirmar limpeza?" : "Limpar erros"}
    </button>
  );
}
