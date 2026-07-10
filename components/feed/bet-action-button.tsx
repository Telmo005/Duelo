"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { acceptBetAction, cancelBetAction } from "@/lib/actions/bets";
import { Spinner } from "@/components/ui/spinner";

export function BetActionButton({
  betId,
  mode,
  label,
  className,
}: {
  betId: string;
  mode: "accept" | "cancel";
  label: string;
  className: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const action = mode === "accept" ? acceptBetAction : cancelBetAction;
      const result = await action(betId);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={className}>
      {isPending && <Spinner />}
      {isPending ? "A processar…" : label}
    </button>
  );
}
