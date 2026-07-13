"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { acceptBetAction, cancelBetAction } from "@/lib/actions/bets";
import { Spinner } from "@/components/ui/spinner";

export function BetActionButton({
  betId,
  mode,
  label,
  icon,
  className,
}: {
  betId: string;
  mode: "accept" | "cancel";
  label: string;
  icon?: React.ReactNode;
  className: string;
}) {
  const [isPending, startTransition] = useTransition();
  // Cancel gives up locked funds and can't be undone — require a second tap
  // within 3s (same arm/confirm pattern used for match/deposit deletion in
  // admin) rather than a modal, since this button already lives inline in a
  // tight feed-card action bar.
  const [confirmCancel, setConfirmCancel] = useState(false);

  function handleClick() {
    if (mode === "cancel" && !confirmCancel) {
      setConfirmCancel(true);
      setTimeout(() => setConfirmCancel(false), 3000);
      return;
    }
    startTransition(async () => {
      const action = mode === "accept" ? acceptBetAction : cancelBetAction;
      const result = await action(betId);
      if (result?.error) toast.error(result.error);
      setConfirmCancel(false);
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={className}>
      {isPending ? <Spinner /> : icon}
      {isPending ? "A processar…" : confirmCancel ? "Confirmar cancelamento?" : label}
    </button>
  );
}
