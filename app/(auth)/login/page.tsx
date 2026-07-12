"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Lock } from "lucide-react";

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signIn({
        phone: fd.get("phone"),
        password: fd.get("password"),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <AuthShell
      eyebrow="Bem-vindo de volta"
      title="Entra na tua conta"
      subtitle={
        <>
          Não tens conta?{" "}
          <Link href="/register" className="font-bold text-primary">Criar conta</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Número de telemóvel</Label>
          <PhoneInput
            id="phone" name="phone" defaultValue="+258 "
            required autoComplete="username" disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/reset-password" className="text-[13px] font-semibold text-primary">Esqueci</Link>
          </div>
          <Input
            id="password" name="password" type="password"
            placeholder="A tua password"
            required autoComplete="current-password" disabled={isPending} maxLength={72}
            className="h-11 rounded-xl px-4 text-[15px]"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm leading-snug text-destructive">
            {error}
          </div>
        )}

        <Button
          id="login-submit" type="submit" disabled={isPending}
          className="press h-12 w-full rounded-xl text-[15px] font-extrabold shadow-[var(--shadow-elevated)] hover:bg-primary/90"
        >
          {isPending && <Spinner />}
          {isPending ? "A entrar…" : "Entrar"}
        </Button>
      </form>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden />
        Sessão protegida e encriptada
      </p>
    </AuthShell>
  );
}
