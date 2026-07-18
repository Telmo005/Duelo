"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MOZAMBIQUE_TIMEZONE, parseMozambiqueDateTimeLocal } from "@/lib/format";

/** "YYYY-MM-DDTHH:mm" in Mozambique local time — what <input
 *  type="datetime-local"> needs, as opposed to the UTC-based toISOString().
 *  Computed via a fixed +2h shift read back with UTC getters, rather than
 *  the runtime's own getFullYear()/getHours() (which reflect whatever
 *  timezone the browser/device happens to be set to) — so editing a match
 *  shows the correct Mozambique wall-clock kickoff even if the admin's
 *  device isn't actually set to it. Mirrors parseMozambiqueDateTimeLocal's
 *  fixed-offset approach (no DST in Mozambique, so this is always exact). */
export function toDatetimeLocal(date: Date): string {
  const shifted = new Date(date.getTime() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** A reasonable starting point for a new match — "in a couple of hours,
 *  on the half hour" — so the field is never handed to the admin blank.
 *  Almost always gets overwritten with the real kickoff, but a filled-in
 *  field reads as "confirm this" instead of "figure this out". */
export function defaultKickoffLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(Math.round(d.getMinutes() / 30) * 30, 0, 0);
  return toDatetimeLocal(d);
}

/** The date/time input for a match's kickoff, admin-side. The native
 *  `datetime-local` picker alone leaves it ambiguous whether what you
 *  typed/picked actually landed correctly (AM/PM mix-ups, day-vs-month
 *  order depending on the browser's locale) — so this adds a plain-language
 *  read-back underneath ("Sábado, 19 de julho às 21:00 — hora de
 *  Moçambique") computed from whatever's currently in the field, updated
 *  live as it changes. That single line is the actual fix for "difícil de
 *  usar": it turns "did I enter this right?" into something you can just
 *  read. Explicitly parsed/rendered as Mozambique time (parseMozambiqueDateTimeLocal
 *  + timeZone below) rather than relying on the admin's device clock
 *  actually being set to it — this preview is the source of truth for what
 *  gets saved (lib/actions/matches.ts uses the same parser), so it stays
 *  correct even on a misconfigured device. */
export function KickoffField({
  id,
  disabled,
  defaultValue,
}: {
  id: string;
  disabled?: boolean;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? defaultKickoffLocal());

  const preview = value
    ? parseMozambiqueDateTimeLocal(value).toLocaleString("pt", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: MOZAMBIQUE_TIMEZONE,
      })
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Data e hora</Label>
      <Input
        id={id}
        name="kickoffAt"
        type="datetime-local"
        required
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {preview && (
        <p className="text-xs capitalize text-muted-foreground">
          {preview} <span className="text-muted-foreground/70">— hora de Moçambique</span>
        </p>
      )}
    </div>
  );
}
