"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { importFixturesAction } from "@/lib/actions/matches";
import { Spinner } from "@/components/ui/spinner";

export function ImportFixturesButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await importFixturesAction();
      if (result.errors.length > 0 && result.inserted === 0 && result.updated === 0) {
        toast.error(result.errors[0]);
      } else if (result.inserted > 0 || result.updated > 0) {
        toast.success(`${result.inserted} novo(s), ${result.updated} atualizado(s)`);
      } else {
        toast.info("Nenhum jogo novo encontrado");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="press inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Spinner className="size-4" /> : <Download className="size-4" aria-hidden />}
      {isPending ? "A importar…" : "Importar jogos (API)"}
    </button>
  );
}
