"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelBetAction } from "@/lib/actions/bets";
import { Spinner } from "@/components/ui/spinner";

/** Cancel-my-own-waiting-bet button for the feed card action bar. Accepting
 *  no longer happens directly from here — it routes through the full
 *  receipt page instead, so the accepter sees match/stake/payout laid out
 *  before committing (see components/feed/duel-post.tsx). */
export function CancelBetButton({
  betId,
  label,
  icon,
  className,
}: {
  betId: string;
  label: string;
  icon?: React.ReactNode;
  className: string;
}) {
  const [isPending, startTransition] = useTransition();
  // Gives up locked funds and can't be undone — require a second tap within
  // 3s (same arm/confirm pattern used for match/deposit deletion in admin)
  // rather than a modal, since this button already lives inline in a tight
  // feed-card action bar.
  const [confirmCancel, setConfirmCancel] = useState(false);

  function handleClick() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      setTimeout(() => setConfirmCancel(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await cancelBetAction(betId);
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
