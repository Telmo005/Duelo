"use client";

import { useTransition } from "react";
import { signOut } from "@/lib/actions/auth";
import { Spinner } from "@/components/ui/spinner";

export function SignOutButton({ id, className }: { id?: string; className: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      id={id}
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
      className={`${className} inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {isPending && <Spinner className="size-3.5" />}
      {isPending ? "A terminar sessão…" : "Terminar sessão"}
    </button>
  );
}
