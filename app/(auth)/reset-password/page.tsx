"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function ResetPasswordPage() {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, setIsPending] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setIsPending(true);
    // Real password-reset SMS wiring lands with a later phase (needs an SMS
    // provider — see Send SMS Hook in the stack notes) — this is the
    // visual/interactive shell only for now.
    setTimeout(() => {
      setIsPending(false);
      setSent(true);
    }, 700);
  }

  return (
    <AuthShell
      eyebrow="Recuperar acesso"
      title="Repor a password"
      subtitle={
        <>
          Lembraste-te? <Link href="/login" className="font-bold text-primary">Entrar</Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-success/25 bg-success/10 px-5 py-8 text-center">
          <span className="text-2xl" aria-hidden>✅</span>
          <p className="text-[15px] font-bold">Verifica o teu SMS</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Se existir uma conta associada a <strong className="text-foreground">{phone}</strong>, vais receber instruções para repor a password.
          </p>
          <Link href="/login" className="mt-2 text-sm font-bold text-primary">
            Voltar ao login →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Indica o número de telemóvel associado à tua conta. Vamos enviar-te instruções por SMS para repor a password.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Número de telemóvel</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+258 84 XXX XXXX"
              required
              autoComplete="username"
              disabled={isPending}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 rounded-xl px-4 text-[15px]"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || !phone.trim()}
            className="press h-12 w-full rounded-xl text-[15px] font-extrabold shadow-[var(--shadow-elevated)] hover:bg-primary/90"
          >
            {isPending && <Spinner />}
            {isPending ? "A enviar…" : "Enviar instruções"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
