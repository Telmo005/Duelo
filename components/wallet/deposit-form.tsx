"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { createDepositAction } from "@/lib/actions/deposit";

const METHODS = [
  { key: "mpesa", label: "M-Pesa", hint: "Números 84 / 85", color: "#F0455B" },
  { key: "emola", label: "e-Mola", hint: "Números 86 / 87", color: "#F2C22A" },
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
  const [phone, setPhone] = useState("+258 ");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const pollStartedAt = useRef<number>(0);

  // "+258" alone has no real local number yet — only its 3 country-code digits.
  const hasNumber = phone.replace(/\D/g, "").length > 3;
  const canSubmit = method !== null && Number(amount) > 0 && hasNumber;
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

    const result = await createDepositAction({ method, amountMt: amount, phone });

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
            <Spinner />
            <div>
              <p className="text-base font-bold">A confirmar o teu depósito…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {popupBlocked
                  ? "O teu navegador bloqueou a aba de pagamento. Clica no botão abaixo para abrir manualmente."
                  : "Abrimos uma nova aba para concluíres o pagamento com segurança. Confirma no teu telemóvel quando for solicitado — isto pode demorar alguns segundos."}
              </p>
            </div>
            {checkoutUrl ? (
              <button
                type="button"
                onClick={openCheckout}
                className={`press flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-colors ${
                  popupBlocked
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-elevated)]"
                    : "border border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                Abrir página de pagamento
              </button>
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
              <button
                type="button"
                onClick={openCheckout}
                className="press rounded-2xl border border-border bg-card px-5 py-2.5 text-sm font-bold text-foreground hover:bg-accent"
              >
                Abrir página de pagamento
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPhase("waiting")}
              className="press mt-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
            >
              Continuar a aguardar
            </button>
          </>
        )}
        <Link href="/dashboard" className="mt-2 text-sm font-semibold text-primary">
          Voltar à carteira
        </Link>
      </div>
    );
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

      {/* Phone */}
      <div>
        <label htmlFor="phone" className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary">3</span>
          Número de telemóvel
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          maxLength={16}
          placeholder="84 XXX XXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onFocus={(e) => {
            const el = e.currentTarget;
            requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
          }}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-[15px] outline-none focus:border-primary"
        />
      </div>

      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      {phase === "submitting" ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-extrabold text-primary-foreground opacity-70">
          <Spinner />
          A iniciar pagamento…
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
