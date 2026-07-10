"use client";

import { useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";

const METHODS = [
  { key: "mpesa", label: "M-Pesa", hint: "Números 84 / 85", color: "#F0455B" },
  { key: "emola", label: "e-Mola", hint: "Números 86 / 87", color: "#F2C22A" },
] as const;

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2500];

type MethodKey = (typeof METHODS)[number]["key"];

export function DepositForm() {
  const [method, setMethod] = useState<MethodKey | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = method !== null && Number(amount) > 0 && phone.trim().length > 0;
  const methodLabel = METHODS.find((m) => m.key === method)?.label;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    // PaySuite integration lands in a later phase — this is the visual/interactive shell only.
    setTimeout(() => setSubmitting(false), 900);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Method selection */}
      <div>
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">1</span>
          Método
        </p>
        <div className="grid grid-cols-2 gap-3">
          {METHODS.map((m) => {
            const isActive = method === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                aria-pressed={isActive}
                className={`press flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors ${
                  isActive ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent"
                }`}
              >
                <span
                  className="flex size-9 items-center justify-center rounded-full text-sm font-extrabold text-white"
                  style={{ background: m.color }}
                >
                  {m.label.charAt(0)}
                </span>
                <span className="text-[15px] font-bold">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">2</span>
          Valor a depositar
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 focus-within:border-primary">
          <input
            id="amount"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent text-2xl font-extrabold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/50"
          />
          <span className="text-lg font-semibold text-muted-foreground">MT</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              className={`press rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                amount === String(v)
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {v.toLocaleString("pt")} MT
            </button>
          ))}
        </div>
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="phone" className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">3</span>
          Número de telemóvel
        </label>
        <input
          id="phone"
          type="tel"
          placeholder="+258 84 XXX XXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] outline-none focus:border-primary"
        />
      </div>

      {submitting ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-extrabold text-primary-foreground opacity-70">
          <Spinner />
          A confirmar…
        </div>
      ) : (
        <button
          type="submit"
          disabled={!canSubmit}
          className="press flex items-center justify-center rounded-2xl bg-primary py-4 text-base font-extrabold tracking-tight text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none"
        >
          {methodLabel ? `Depositar via ${methodLabel}` : "Depositar"}
        </button>
      )}

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        🔒 Pagamento processado com segurança via PaySuite.{" "}
        <Link href="/dashboard" className="font-semibold text-primary">
          Voltar à carteira
        </Link>
      </p>
    </form>
  );
}
