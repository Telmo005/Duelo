"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { registerUser } from "@/lib/actions/auth";
import { requestPhoneVerification } from "@/lib/actions/phoneVerification";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function RegisterPage() {
  // useSearchParams needs a Suspense boundary to not block the rest of the
  // route from prerendering — the form itself has no server data, only the
  // ?ref= prefill depends on it.
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

const RESEND_COOLDOWN_S = 60;

function RegisterForm() {
  const [isPending, startTransition] = useTransition();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-phase form: "form" collects name/phone/password and sends the SMS
  // code (requestPhoneVerification); "code" reveals the code field and the
  // actual submit becomes registerUser, which re-verifies the code
  // server-side before creating the account (see lib/phoneOtp.ts). Fields
  // from phase "form" are never disabled once phase flips — a disabled
  // input is excluded from FormData entirely, which would silently drop
  // displayName/phone/password from the registerUser call.
  const [phase, setPhase] = useState<"form" | "code">("form");
  const [resendIn, setResendIn] = useState(0);
  // Manual entry always wins over the link-prefilled value — someone who
  // was dictated a code over WhatsApp/voice, with no link involved, needs
  // to be able to type over whatever (if anything) is here.
  const searchParams = useSearchParams();
  const [referralCode, setReferralCode] = useState(() => searchParams.get("ref") ?? "");

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("phone") ?? "");

    if (phase === "form") {
      startTransition(async () => {
        const result = await requestPhoneVerification({ phone });
        if (result?.error) {
          setError(result.error);
          return;
        }
        setPhase("code");
        setResendIn(RESEND_COOLDOWN_S);
      });
      return;
    }

    startTransition(async () => {
      const result = await registerUser({
        displayName: fd.get("displayName"),
        phone,
        password: fd.get("password"),
        ageConfirmed,
        otpCode: fd.get("otpCode"),
        referralCode: referralCode.trim() || undefined,
      });
      if (result?.error) setError(result.error);
    });
  }

  function handleResend(phoneValue: string) {
    if (resendIn > 0 || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await requestPhoneVerification({ phone: phoneValue });
      if (result?.error) setError(result.error);
      else setResendIn(RESEND_COOLDOWN_S);
    });
  }

  return (
    <AuthShell
      eyebrow="Junta-te em segundos"
      title="Cria a tua conta"
      subtitle={
        <>
          Já tens conta?{" "}
          <Link href="/login" className="font-bold text-primary">Entrar</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">Nome/Nickname</Label>
          <Input
            id="displayName" name="displayName" type="text" placeholder="Como te chamam?"
            required disabled={isPending} maxLength={50}
            className="h-11 rounded-xl px-4 text-[15px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Número de telemóvel</Label>
          <PhoneInput
            id="phone" name="phone" defaultValue="+258 "
            required disabled={isPending} readOnly={phase === "code"}
          />
          <p className="text-[11px] text-muted-foreground">
            {phase === "form"
              ? "Vamos enviar um código por SMS para confirmar este número."
              : "Confirma o código que enviámos por SMS para este número."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password" name="password" type="password" placeholder="Mínimo 4 caracteres"
            required disabled={isPending} maxLength={72}
            className="h-11 rounded-xl px-4 text-[15px]"
          />
        </div>

        {phase === "code" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otpCode">Código de verificação</Label>
            <Input
              id="otpCode" name="otpCode" type="text" inputMode="numeric" autoComplete="one-time-code"
              placeholder="000000" required disabled={isPending} maxLength={6}
              className="h-11 rounded-xl px-4 text-center text-[17px] font-bold tracking-[0.3em]"
            />
            <div className="mt-0.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setPhase("form"); setError(null); setResendIn(0); }}
                disabled={isPending}
                className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
              >
                Usar outro número
              </button>
              <button
                type="button"
                onClick={(e) => {
                  const form = e.currentTarget.closest("form");
                  const phoneValue = form ? String(new FormData(form).get("phone") ?? "") : "";
                  handleResend(phoneValue);
                }}
                disabled={resendIn > 0 || isPending}
                className="text-[11px] font-semibold text-primary-text underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                {resendIn > 0 ? `Reenviar código (${resendIn}s)` : "Reenviar código"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="referralCode">Código de convite (opcional)</Label>
          <Input
            id="referralCode" name="referralCode" type="text" placeholder="Ex: K7M2QRX"
            disabled={isPending} maxLength={20}
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            className="h-11 rounded-xl px-4 text-[15px] uppercase"
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
          id="register-submit" type="submit" disabled={!ageConfirmed || isPending}
          className={`press h-12 w-full rounded-xl text-[15px] font-extrabold ${
            ageConfirmed ? "shadow-[var(--shadow-elevated)] hover:bg-primary-90" : ""
          }`}
        >
          {isPending && <Spinner />}
          {phase === "form"
            ? (isPending ? "A enviar código…" : "Enviar código")
            : (isPending ? "A criar conta…" : "Confirmar e criar conta")}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        Ao criar conta confirmas que tens 18 anos ou mais.<br />
        Disponível apenas em Moçambique.
      </p>
    </AuthShell>
  );
}
