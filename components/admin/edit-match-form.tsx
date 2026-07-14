"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { updateMatchAction } from "@/lib/actions/matches";
import { TeamSearchPicker } from "@/components/admin/team-search-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionButton } from "@/components/ui/action-button";
import type { MatchRow } from "@/db/schema";

/** "YYYY-MM-DDTHH:mm" in LOCAL time — what <input type="datetime-local">
 *  needs, as opposed to the UTC-based toISOString(). */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Inline "corrigir jogo" form — swapped in for SettleMatchRow's normal
 *  display+actions row while editing. Covers the "enganei-me na hora" case
 *  (and, incidentally, typo'd team/league names) for any match that hasn't
 *  been settled yet, whether or not it already has bets against it. */
export function EditMatchForm({ match, onDone }: { match: MatchRow; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateMatchAction(match.id, {
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
        toast.success("Jogo atualizado");
        onDone();
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="grid w-full gap-3 border-b border-border p-4 last:border-b-0 sm:grid-cols-2 lg:grid-cols-5"
    >
      <TeamSearchPicker
        id={`home-${match.id}`}
        name="home"
        logoFieldName="homeLogoUrl"
        label="Equipa da casa"
        placeholder="Ferroviário"
        disabled={isPending}
        defaultValue={match.home}
        defaultLogoUrl={match.homeLogoUrl ?? ""}
      />
      <TeamSearchPicker
        id={`away-${match.id}`}
        name="away"
        logoFieldName="awayLogoUrl"
        label="Equipa visitante"
        placeholder="Costa do Sol"
        disabled={isPending}
        defaultValue={match.away}
        defaultLogoUrl={match.awayLogoUrl ?? ""}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`league-${match.id}`}>Liga / competição</Label>
        <Input id={`league-${match.id}`} name="league" required disabled={isPending} maxLength={100} defaultValue={match.league} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`kickoff-${match.id}`}>Data e hora</Label>
        <Input
          id={`kickoff-${match.id}`}
          name="kickoffAt"
          type="datetime-local"
          required
          disabled={isPending}
          defaultValue={toDatetimeLocal(new Date(match.kickoffAt))}
        />
      </div>
      <div className="flex items-end gap-2">
        <ActionButton type="submit" size="md" loading={isPending} icon={<Check className="size-4" aria-hidden />}>
          Guardar
        </ActionButton>
        <ActionButton type="button" variant="ghost" size="md" disabled={isPending} icon={<X className="size-4" aria-hidden />} onClick={onDone}>
          Cancelar
        </ActionButton>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2 lg:col-span-5">
        <input
          id={`isElimination-${match.id}`}
          name="isElimination"
          type="checkbox"
          disabled={isPending}
          defaultChecked={match.isElimination}
          className="size-4 accent-primary"
        />
        Jogo de eliminação (final, mata-mata — sem opção de empate)
      </label>
    </form>
  );
}
