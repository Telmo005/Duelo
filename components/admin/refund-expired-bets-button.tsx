"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { refundExpiredBetsAction } from "@/lib/actions/settlement";
import { Spinner } from "@/components/ui/spinner";

export function RefundExpiredBetsButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await refundExpiredBetsAction();
      if (result.error) toast.error(result.error);
      else if (result.refunded && result.refunded > 0) toast.success(`${result.refunded} aposta(s) reembolsada(s)`);
      else toast.info("Nenhuma aposta pendente de reembolso agora");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="press inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Spinner className="size-4" /> : <RotateCcw className="size-4" aria-hidden />}
      {isPending ? "A verificar…" : "Reembolsar sem adversário"}
    </button>
  );
}
