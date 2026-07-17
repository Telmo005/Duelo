"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registerUser } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await registerUser({
        displayName: fd.get("displayName"),
        phone: fd.get("phone"),
        password: fd.get("password"),
        ageConfirmed,
      });
      if (result?.error) setError(result.error);
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
          <p className="text-[11px] text-muted-foreground">Vamos usar este número para entrares na tua conta.</p>
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
          id="register-submit" type="submit" disabled={!ageConfirmed || isPending}
          className={`press h-12 w-full rounded-xl text-[15px] font-extrabold ${
            ageConfirmed ? "shadow-[var(--shadow-elevated)] hover:bg-primary-90" : ""
          }`}
        >
          {isPending && <Spinner />}
          {isPending ? "A criar conta…" : "Criar conta"}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
        Ao criar conta confirmas que tens 18 anos ou mais.<br />
        Disponível apenas em Moçambique.
      </p>
    </AuthShell>
  );
}
