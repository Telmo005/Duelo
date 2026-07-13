"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, ShieldCheck, Clock } from "lucide-react";
import { SectionLabel } from "@/components/ui/section-label";
import { OptionCard } from "@/components/ui/option-card";
import { ActionButton } from "@/components/ui/action-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { createWithdrawalAction } from "@/lib/actions/withdrawals";
import { formatCentsAsMt } from "@/lib/format";
import { WITHDRAWAL_MIN_MT } from "@/lib/validation/withdrawal";

const METHODS = [
  { key: "mpesa", label: "M-Pesa", hint: "Números 84 · 85" },
  { key: "emola", label: "e-Mola", hint: "Números 86 · 87" },
] as const;

type MethodKey = (typeof METHODS)[number]["key"];

export function WithdrawForm({
  availableCents,
  defaultPhone,
  defaultRecipientName,
}: {
  availableCents: number;
  defaultPhone: string;
  defaultRecipientName: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<MethodKey | null>(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const availableMt = availableCents / 100;
  const amountNum = Number(amount);
  const canSubmit = method !== null && amountNum >= WITHDRAWAL_MIN_MT && amountNum <= availableMt;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || !method) return;

    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const result = await createWithdrawalAction({
      method,
      amountMt: amount,
      phone: fd.get("phone"),
      recipientName: fd.get("recipientName"),
    });

    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-locked-10 text-locked" aria-hidden>
          <Clock className="size-7" />
        </span>
        <div>
          <p className="text-base font-bold">Pedido de levantamento enviado</p>
          <p className="mt-1.5 max-w-72 text-sm leading-relaxed text-muted-foreground">
            O valor já saiu do teu saldo disponível e fica em custódia até a nossa equipa processar o
            pagamento manualmente. Costuma demorar até 24 horas úteis.
          </p>
        </div>
        <ActionButton type="button" onClick={() => router.push("/dashboard")} block>
          Voltar à carteira
        </ActionButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Method */}
      <div>
        <SectionLabel step={1}>Método</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {METHODS.map((m) => (
            <OptionCard
              key={m.key}
              selected={method === m.key}
              onSelect={() => setMethod(m.key)}
              ariaLabel={m.label}
              className="flex flex-col items-start gap-2.5"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground">
                <Smartphone className="size-5" aria-hidden />
              </span>
              <span className="text-[15px] font-bold">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.hint}</span>
            </OptionCard>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div>
        <SectionLabel step={2} htmlFor="amount">
          Valor a levantar
        </SectionLabel>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 focus-within:border-primary">
          <input
            id="amount"
            type="number"
            inputMode="numeric"
            min={WITHDRAWAL_MIN_MT}
            max={availableMt}
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent text-2xl font-extrabold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/50"
          />
          <span className="text-lg font-semibold text-muted-foreground">MT</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Mínimo {WITHDRAWAL_MIN_MT} MT</span>
          <span>Disponível: {formatCentsAsMt(availableCents)} MT</span>
        </div>
        {amount !== "" && amountNum > availableMt && (
          <p className="mt-1.5 text-xs font-semibold text-destructive">Saldo insuficiente.</p>
        )}
      </div>

      {/* Destination */}
      <div>
        <SectionLabel step={3}>Para onde enviar</SectionLabel>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="withdraw-phone">Número de telemóvel</Label>
            <PhoneInput id="withdraw-phone" name="phone" defaultValue={defaultPhone} required disabled={submitting} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipientName">Nome de quem vai receber</Label>
            <Input
              id="recipientName"
              name="recipientName"
              placeholder="Como está registado na conta móvel"
              defaultValue={defaultRecipientName}
              required
              disabled={submitting}
              maxLength={100}
            />
          </div>
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      <ActionButton type="submit" size="lg" block disabled={!canSubmit} loading={submitting}>
        {submitting ? "A enviar pedido…" : "Pedir levantamento"}
      </ActionButton>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        O valor fica bloqueado de imediato. Processado manualmente pela nossa equipa via PaySuite.
      </p>
    </form>
  );
}
