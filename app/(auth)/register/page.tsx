"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { requestPhoneVerification } from "@/lib/actions/phoneVerification";
import { useRegisterPending } from "./layout";
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

function RegisterForm() {
  const router = useRouter();
  const { setPending } = useRegisterPending();
  const [isPending, startTransition] = useTransition();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Manual entry always wins over the link-prefilled value — someone who
  // was dictated a code over WhatsApp/voice, with no link involved, needs
  // to be able to type over whatever (if anything) is here.
  const searchParams = useSearchParams();
  const [referralCode, setReferralCode] = useState(() => searchParams.get("ref") ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const displayName = String(fd.get("displayName") ?? "");
    const phone = String(fd.get("phone") ?? "");
    const password = String(fd.get("password") ?? "");

    startTransition(async () => {
      const result = await requestPhoneVerification({ phone });
      if (result?.error) {
        setError(result.error);
        return;
      }

      // Handed to the shared layout's in-memory context (see ./layout) —
      // never sessionStorage/localStorage, since that would mean writing
      // the plaintext password to disk. /register/confirmar reads it from
      // there and only ever asks for the SMS code.
      setPending({ displayName, phone, password, ageConfirmed, referralCode: referralCode.trim() || undefined });
      router.push("/register/confirmar");
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
            required disabled={isPending} minLength={2} maxLength={50}
            className="h-11 rounded-xl px-4 text-[15px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Número de telemóvel</Label>
          <PhoneInput
            id="phone" name="phone" defaultValue="+258 "
            required disabled={isPending}
          />
          <p className="text-[11px] text-muted-foreground">Vamos enviar um código por SMS para confirmar este número.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password" name="password" type="password" placeholder="Mínimo 4 caracteres"
            required disabled={isPending} minLength={4} maxLength={72}
            className="h-11 rounded-xl px-4 text-[15px]"
          />
        </div>

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
          {isPending ? "A enviar código…" : "Enviar código"}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        Ao criar conta confirmas que tens 18 anos ou mais.<br />
        Disponível apenas em Moçambique.
      </p>
    </AuthShell>
  );
}
