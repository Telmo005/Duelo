"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { addMatchAction } from "@/lib/actions/matches";
import { ActionButton } from "@/components/ui/action-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TeamSearchPicker } from "@/components/admin/team-search-picker";

export function AddMatchForm() {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addMatchAction({
        home: fd.get("home"),
        away: fd.get("away"),
        league: fd.get("league"),
        kickoffAt: fd.get("kickoffAt"),
        homeLogoUrl: fd.get("homeLogoUrl"),
        awayLogoUrl: fd.get("awayLogoUrl"),
        isElimination: fd.get("isElimination"),
      });
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Jogo adicionado");
        formRef.current?.reset();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <TeamSearchPicker
        id="home"
        name="home"
        logoFieldName="homeLogoUrl"
        label="Equipa da casa"
        placeholder="Ferroviário"
        disabled={isPending}
      />
      <TeamSearchPicker
        id="away"
        name="away"
        logoFieldName="awayLogoUrl"
        label="Equipa visitante"
        placeholder="Costa do Sol"
        disabled={isPending}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="league">Liga / competição</Label>
        <Input id="league" name="league" placeholder="Moçambola" required disabled={isPending} maxLength={100} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kickoffAt">Data e hora</Label>
        <Input id="kickoffAt" name="kickoffAt" type="datetime-local" required disabled={isPending} />
      </div>
      <div className="flex items-end">
        <ActionButton type="submit" block loading={isPending} icon={<Plus className="size-4" aria-hidden />}>
          Adicionar jogo
        </ActionButton>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2 lg:col-span-5">
        <input id="isElimination" name="isElimination" type="checkbox" disabled={isPending} className="size-4 accent-primary" />
        Jogo de eliminação (final, mata-mata — sem opção de empate)
      </label>
    </form>
  );
}
