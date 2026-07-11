"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Smartphone, ShieldCheck } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { SectionLabel } from "@/components/ui/section-label";
import { OptionCard } from "@/components/ui/option-card";
import { ActionButton } from "@/components/ui/action-button";
import { createDepositAction } from "@/lib/actions/deposit";

const METHODS = [
  { key: "mpesa", label: "M-Pesa", hint: "Números 84 · 85" },
  { key: "emola", label: "e-Mola", hint: "Números 86 · 87" },
] as const;

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2500];

// PayGate/PaySuite não confirma na hora — o webhook normalmente chega em
// poucos segundos, mas o utilizador pode demorar a concluir no telemóvel.
// Para de perguntar depois deste tempo e mostra a mensagem de fallback.
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

type MethodKey = (typeof METHODS)[number]["key"];
type Phase = "form" | "submitting" | "waiting" | "timeout";

export function DepositForm() {
  const router = useRouter();
  const [method, setMethod] = useState<MethodKey | null>(null);
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const pollStartedAt = useRef<number>(0);

  const canSubmit = method !== null && Number(amount) > 0;
  const methodLabel = METHODS.find((m) => m.key === method)?.label;

  useEffect(() => {
    if (phase !== "waiting" || !depositId) return;

    pollStartedAt.current = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - pollStartedAt.current > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setPhase("timeout");
        return;
      }

      try {
        const res = await fetch(`/api/deposits/${depositId}`);
        if (!res.ok) return; // transient — try again next tick
        const data: { status: "pending" | "success" | "failed" } = await res.json();

        if (data.status === "success") {
          clearInterval(interval);
          router.push("/dashboard");
          router.refresh();
        } else if (data.status === "failed") {
          clearInterval(interval);
          setError("O pagamento falhou. Tenta novamente.");
          setPhase("form");
        }
      } catch {
        // network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase, depositId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !method) return;

    setError(null);
    setPhase("submitting");

    const result = await createDepositAction({ method, amountMt: amount });

    if (result.error) {
      setError(result.error);
      setPhase("form");
      return;
    }

    if (result.checkoutUrl && result.depositId) {
      // Alguns navegadores (sobretudo em telemóvel) bloqueiam popups abertos
      // depois de um `await` — deixamos de contar como "gesto directo" do
      // utilizador. Guardamos o URL e mostramos sempre um botão manual na
      // tela de espera, para o caso desta tentativa automática ser bloqueada.
      const popup = window.open(result.checkoutUrl, "_blank");
      setPopupBlocked(!popup || popup.closed);
      setCheckoutUrl(result.checkoutUrl);
      setDepositId(result.depositId);
      setPhase("waiting");
    } else {
      setError("Não foi possível iniciar o pagamento. Tenta novamente.");
      setPhase("form");
    }
  }

  function openCheckout() {
    if (!checkoutUrl) return;
    const popup = window.open(checkoutUrl, "_blank");
    setPopupBlocked(!popup || popup.closed);
  }

  if (phase === "waiting" || phase === "timeout") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
        {phase === "waiting" ? (
          <>
            <Spinner className="size-7" />
            <div>
              <p className="text-base font-bold">A confirmar o teu depósito…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {popupBlocked
                  ? "O teu navegador bloqueou a aba de pagamento. Toca no botão abaixo para abrir e concluíres no PaySuite."
                  : "Abrimos uma nova aba para concluíres o pagamento com segurança. Confirma no teu telemóvel quando for solicitado — pode demorar alguns segundos."}
              </p>
            </div>
            {checkoutUrl ? (
              <ActionButton
                type="button"
                onClick={openCheckout}
                variant={popupBlocked ? "primary" : "secondary"}
                block
              >
                Abrir página de pagamento
              </ActionButton>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-base font-bold">Ainda a processar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Isto está a demorar mais que o esperado. Se já confirmaste o pagamento no telemóvel,
              o saldo aparece assim que for processado — podes voltar à carteira e verificar mais
              tarde.
            </p>
            {checkoutUrl ? (
              <ActionButton type="button" onClick={openCheckout} variant="secondary" size="sm">
                Abrir página de pagamento
              </ActionButton>
            ) : null}
            <ActionButton type="button" onClick={() => setPhase("waiting")} size="sm">
              Continuar a aguardar
            </ActionButton>
          </>
        )}
        <Link href="/dashboard" className="mt-1 text-sm font-semibold text-primary">
          Voltar à carteira
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Method selection */}
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
          Valor a depositar
        </SectionLabel>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 focus-within:border-primary">
          <input
            id="amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000000}
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

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      <ActionButton
        type="submit"
        size="lg"
        block
        disabled={!canSubmit}
        loading={phase === "submitting"}
      >
        {phase === "submitting"
          ? "A iniciar pagamento…"
          : methodLabel
          ? `Depositar via ${methodLabel}`
          : "Depositar"}
      </ActionButton>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        Pagamento processado com segurança via PaySuite. O número é pedido no checkout.
      </p>
    </form>
  );
}
