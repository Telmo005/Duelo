"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { changePasswordAction } from "@/lib/actions/auth";
import { ActionButton } from "@/components/ui/action-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await changePasswordAction({
        password: fd.get("password"),
        confirmPassword: fd.get("confirmPassword"),
      });
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Password alterada com sucesso");
        formRef.current?.reset();
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-locked-10 text-locked" aria-hidden>
          <KeyRound className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="text-sm font-bold">Alterar password</p>
          <p className="text-xs text-muted-foreground">Define uma nova password de acesso</p>
        </span>
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <p className="text-sm font-bold">Alterar password</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Nova password</Label>
        <Input
          id="password" name="password" type="password" placeholder="Mínimo 4 caracteres"
          required disabled={isPending} maxLength={72} autoComplete="new-password"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirmar password</Label>
        <Input
          id="confirmPassword" name="confirmPassword" type="password" placeholder="Repete a password"
          required disabled={isPending} maxLength={72} autoComplete="new-password"
        />
      </div>

      <div className="flex gap-2">
        <ActionButton type="submit" size="md" block loading={isPending}>
          Guardar
        </ActionButton>
        <ActionButton type="button" variant="ghost" size="md" disabled={isPending} onClick={() => setOpen(false)}>
          Cancelar
        </ActionButton>
      </div>
    </form>
  );
}
