"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/actions/auth";
import { requestPhoneVerification } from "@/lib/actions/phoneVerification";
import { useRegisterPending } from "../layout";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const RESEND_COOLDOWN_S = 60;

export default function ConfirmRegistrationPage() {
  const router = useRouter();
  const { pending, clearPending } = useRegisterPending();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Page 1 already sent a code right before navigating here, so the cooldown
  // starts pre-armed instead of letting an immediate "Reenviar" tap fire a
  // second SMS for the same code the user hasn't even seen yet.
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_S);

  // No pending data (direct nav to this URL, or a hard refresh — the layout's
  // context is in-memory only, see ./layout) — nothing to confirm, bounce
  // back to start the flow properly.
  useEffect(() => {
    if (!pending) router.replace("/register");
  }, [pending, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  function handleUseAnotherNumber() {
    clearPending();
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
        password: pending.password,
        ageConfirmed: pending.ageConfirmed,
        otpCode: fd.get("otpCode"),
        referralCode: pending.referralCode,
      });
      if (result?.error) setError(result.error);
    });
  }

  // Already bouncing back to /register — render nothing rather than a flash
  // of an unusable form.
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

        {error && (
          <div role="alert" className="rounded-xl border border-destructive-35 bg-destructive-10 px-4 py-3 text-sm leading-snug text-destructive">
            {error}
          </div>
        )}

        <Button
          id="confirm-register-submit" type="submit" disabled={isPending}
          className="press h-12 w-full rounded-xl text-[15px] font-extrabold shadow-[var(--shadow-elevated)] hover:bg-primary-90"
        >
          {isPending && <Spinner />}
          {isPending ? "A criar conta…" : "Confirmar e criar conta"}
        </Button>
      </form>
    </AuthShell>
  );
}
