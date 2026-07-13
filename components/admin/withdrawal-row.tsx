"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X, AlertTriangle } from "lucide-react";
import { completeWithdrawalAction, rejectWithdrawalAction } from "@/lib/actions/withdrawals";
import { formatCentsAsMt } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import type { PendingWithdrawalRow } from "@/lib/withdrawals";

export function WithdrawalRow({ withdrawal }: { withdrawal: PendingWithdrawalRow }) {
  const [isPending, startTransition] = useTransition();
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  // Surfaced so an admin can catch a payout going to someone other than the
  // account owner before actually sending real money — see the fraud-review
  // note in supabase/migrations/0017_withdrawals.sql.
  const phoneMismatch = withdrawal.requesterPhone !== withdrawal.phone;
  const nameMismatch = withdrawal.requesterDisplayName.trim().toLowerCase() !== withdrawal.recipientName.trim().toLowerCase();

  function handleComplete() {
    if (!confirmComplete) {
      setConfirmComplete(true);
      setTimeout(() => setConfirmComplete(false), 3000);
      return;
    }
    startTransition(async () => {
      const result = await completeWithdrawalAction(withdrawal.id);
      if (result?.error) toast.error(result.error);
      else toast.success("Levantamento marcado como concluído");
      setConfirmComplete(false);
    });
  }

  function handleReject() {
    if (!note.trim()) {
      toast.error("Indica o motivo da rejeição.");
      return;
    }
    startTransition(async () => {
      const result = await rejectWithdrawalAction(withdrawal.id, note);
      if (result?.error) toast.error(result.error);
      else toast.success("Levantamento rejeitado — saldo devolvido");
      setRejecting(false);
      setNote("");
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold tabular-nums">{formatCentsAsMt(withdrawal.amountCents)} MT</p>
          <p className="text-xs text-muted-foreground">
            {withdrawal.reference} · {new Date(withdrawal.createdAt).toLocaleString("pt", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary-10 px-2.5 py-1 text-xs font-bold text-primary">
          {withdrawal.method === "mpesa" ? "M-Pesa" : "e-Mola"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-secondary/40 p-3 text-sm">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">Conta Duelo</p>
          <p className="truncate font-bold">{withdrawal.requesterDisplayName}</p>
          <p className="truncate text-xs text-muted-foreground">{withdrawal.requesterPhone ?? "sem número"}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">Destino do pagamento</p>
          <p className={`truncate font-bold ${nameMismatch ? "text-destructive" : ""}`}>{withdrawal.recipientName}</p>
          <p className={`truncate text-xs ${phoneMismatch ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
            {withdrawal.phone}
          </p>
        </div>
      </div>

      {(phoneMismatch || nameMismatch) && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          O destino não corresponde à conta registada — confirma antes de processar.
        </p>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo da rejeição (o utilizador vai ver isto)"
            disabled={isPending}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="press inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <Spinner className="size-3" /> : <X className="size-3" aria-hidden />}
              Confirmar rejeição
            </button>
            <button
              type="button"
              onClick={() => { setRejecting(false); setNote(""); }}
              disabled={isPending}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleComplete}
            disabled={isPending}
            className={`press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              confirmComplete ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"
            }`}
          >
            {isPending ? <Spinner className="size-3" /> : <Check className="size-3" aria-hidden />}
            {isPending ? "A processar…" : confirmComplete ? "Confirmar — já paguei?" : "Marcar como concluído"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={isPending}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-3" aria-hidden />
            Rejeitar
          </button>
        </div>
      )}
    </div>
  );
}
