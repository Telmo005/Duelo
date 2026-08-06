"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/actions/auth";
import { requestPhoneVerification } from "@/lib/actions/phoneVerification";
import { REGISTER_PENDING_KEY, type RegisterPendingData } from "@/lib/registerPending";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const RESEND_COOLDOWN_S = 60;

export default function ConfirmRegistrationPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_S);
  // undefined = still reading sessionStorage; null = nothing there (bad
  // direct nav — bounce back to /register, see the effect below).
  const [pending, setPending] = useState<RegisterPendingData | null | undefined>(undefined);

  useEffect(() => {
    const raw = sessionStorage.getItem(REGISTER_PENDING_KEY);
    if (!raw) {
      setPending(null);
      return;
    }
    try {
      setPending(JSON.parse(raw) as RegisterPendingData);
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    if (pending === null) router.replace("/register");
  }, [pending, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  function handleUseAnotherNumber() {
    sessionStorage.removeItem(REGISTER_PENDING_KEY);
    router.push("/register");
  }

  function handleResend() {
    if (!pending || resendIn > 0 || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await requestPhoneVerification({ phone: pending.phone });
      if (result?.error) setError(result.error);
      else setResendIn(RESEND_COOLDOWN_S);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await registerUser({
        displayName: pending.displayName,
        phone: pending.phone,
        password: fd.get("password"),
        ageConfirmed,
        otpCode: fd.get("otpCode"),
        referralCode: pending.referralCode,
      });
      if (result?.error) setError(result.error);
    });
  }

  // Waiting on the sessionStorage read, or already bouncing back to
  // /register — render nothing rather than a flash of an unusable form.
  if (!pending) return null;

  return (
    <AuthShell
      eyebrow="Último passo"
      title="Confirma o teu número"
      subtitle={<>Enviámos um código por SMS para <strong className="text-foreground">{pending.phone}</strong>.</>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="otpCode">Código de verificação</Label>
          <Input
            id="otpCode" name="otpCode" type="text" inputMode="numeric" autoComplete="one-time-code"
            placeholder="000000" required disabled={isPending} maxLength={6} autoFocus
            className="h-11 rounded-xl px-4 text-center text-[17px] font-bold tracking-[0.3em]"
          />
          <div className="mt-0.5 flex items-center justify-between">
            <button
              type="button"
              onClick={handleUseAnotherNumber}
              disabled={isPending}
              className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              Usar outro número
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendIn > 0 || isPending}
              className="text-[11px] font-semibold text-primary-text underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {resendIn > 0 ? `Reenviar código (${resendIn}s)` : "Reenviar código"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password" name="password" type="password" placeholder="Mínimo 4 caracteres"
            required disabled={isPending} maxLength={72}
            className="h-11 rounded-xl px-4 text-[15px]"
          />
        </div>

        {/* 18+ toggle */}
        <button
          type="button"
          onClick={() => setAgeConfirmed((v) => !v)}
          disabled={isPending}
          className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
            ageConfirmed ? "border-primary-40 bg-primary/[0.08]" : "border-border bg-background"
          }`}
        >
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors ${
              ageConfirmed ? "border-primary bg-primary" : "border-border bg-muted"
            }`}
          >
            {ageConfirmed && (
              <svg width="11" height="9" fill="none" viewBox="0 0 11 9">
                <path d="M1 4.5L4 7.5L10 1" stroke="#14150B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className="text-[13px] font-semibold">
            Confirmo que tenho <strong className="text-primary">18 anos</strong> ou mais
          </span>
        </button>

        {error && (
          <div role="alert" className="rounded-xl border border-destructive-35 bg-destructive-10 px-4 py-3 text-sm leading-snug text-destructive">
            {error}
          </div>
        )}

        <Button
          id="confirm-register-submit" type="submit" disabled={!ageConfirmed || isPending}
          className={`press h-12 w-full rounded-xl text-[15px] font-extrabold ${
            ageConfirmed ? "shadow-[var(--shadow-elevated)] hover:bg-primary-90" : ""
          }`}
        >
          {isPending && <Spinner />}
          {isPending ? "A criar conta…" : "Confirmar e criar conta"}
        </Button>
      </form>
    </AuthShell>
  );
}
