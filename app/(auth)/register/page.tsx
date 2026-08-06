"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { requestPhoneVerification } from "@/lib/actions/phoneVerification";
import { REGISTER_PENDING_KEY, type RegisterPendingData } from "@/lib/registerPending";
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
  const [isPending, startTransition] = useTransition();
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

    startTransition(async () => {
      const result = await requestPhoneVerification({ phone });
      if (result?.error) {
        setError(result.error);
        return;
      }

      // Nothing sensitive here (no password) — safe to bridge to the
      // confirmation page via sessionStorage rather than a visible query
      // string. /register/confirmar redirects back here if this is missing
      // (e.g. someone opens that URL directly in a new tab).
      const pending: RegisterPendingData = { displayName, phone, referralCode: referralCode.trim() || undefined };
      sessionStorage.setItem(REGISTER_PENDING_KEY, JSON.stringify(pending));
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
            required disabled={isPending} maxLength={50}
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
          <Label htmlFor="referralCode">Código de convite (opcional)</Label>
          <Input
            id="referralCode" name="referralCode" type="text" placeholder="Ex: K7M2QRX"
            disabled={isPending} maxLength={20}
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            className="h-11 rounded-xl px-4 text-[15px] uppercase"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-destructive-35 bg-destructive-10 px-4 py-3 text-sm leading-snug text-destructive">
            {error}
          </div>
        )}

        <Button
          id="register-submit" type="submit" disabled={isPending}
          className="press h-12 w-full rounded-xl text-[15px] font-extrabold shadow-[var(--shadow-elevated)] hover:bg-primary-90"
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
