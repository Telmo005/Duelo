"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { reconcileDepositsAction } from "@/lib/actions/deposit-admin";
import { Spinner } from "@/components/ui/spinner";

export function ReconcileDepositsButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await reconcileDepositsAction();
      if (result.credited > 0) toast.success(`${result.credited} depósito(s) creditado(s)`);
      else if (result.checked === 0) toast.info("Nenhum depósito pendente ou falhado nos últimos 7 dias");
      else toast.info(`${result.checked} verificado(s), nada por creditar`);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="press inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Spinner className="size-4" /> : <RefreshCw className="size-4" aria-hidden />}
      {isPending ? "A verificar…" : "Reconciliar depósitos"}
    </button>
  );
}
