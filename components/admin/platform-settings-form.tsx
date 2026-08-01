"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { updatePlatformSettingsAction } from "@/lib/actions/platform-settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

/** Admin-only config for the two rates bet_settle_match reads on every
 *  settlement — never retroactive, only future settlements pick up a
 *  change (each payout snapshots its own rate, see affiliate_ledger). */
export function PlatformSettingsForm({
  initialCommissionPct,
  initialReferralSharePct,
}: {
  initialCommissionPct: number;
  initialReferralSharePct: number;
}) {
  const [commissionPct, setCommissionPct] = useState(String(initialCommissionPct));
  const [referralSharePct, setReferralSharePct] = useState(String(initialReferralSharePct));
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updatePlatformSettingsAction(Number(commissionPct), Number(referralSharePct));
      if (result.error) toast.error(result.error);
      else toast.success("Percentagens atualizadas — aplica-se a partir da próxima liquidação.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="commissionPct">Comissão da casa (%)</Label>
        <Input
          id="commissionPct" type="number" min={1} max={50} step="0.1"
          value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)}
          disabled={isPending} className="h-11 rounded-xl px-4 text-[15px]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="referralSharePct">Percentagem de afiliado (%)</Label>
        <Input
          id="referralSharePct" type="number" min={0} max={100} step="0.1"
          value={referralSharePct} onChange={(e) => setReferralSharePct(e.target.value)}
          disabled={isPending} className="h-11 rounded-xl px-4 text-[15px]"
        />
        <p className="text-[11px] text-muted-foreground">% da comissão da casa que cada referrer recebe por lado referido.</p>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="press flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <Spinner className="size-4" /> : <Save className="size-4" aria-hidden />}
        Guardar
      </button>
    </form>
  );
}
