"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateDisplayName } from "@/lib/actions/profile";
import { Spinner } from "@/components/ui/spinner";

export function EditableDisplayName({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    startTransition(async () => {
      const result = await updateDisplayName(trimmed);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setName(trimmed);
      setEditing(false);
      toast.success("Nome atualizado");
      router.refresh();
    });
  }

  function handleCancel() {
    setName(initialName);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{name}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Editar nome"
          className="press flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ✏️
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        disabled={isPending}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") handleCancel();
        }}
        className="min-w-0 flex-1 rounded-lg border border-primary-40 bg-card px-2.5 py-1 text-xl font-extrabold tracking-tight outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || name.trim().length < 2}
        className="press flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending && <Spinner className="size-3" />}
        {isPending ? "A guardar…" : "Guardar"}
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="press shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
      >
        Cancelar
      </button>
    </div>
  );
}
