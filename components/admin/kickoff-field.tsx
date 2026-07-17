"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "YYYY-MM-DDTHH:mm" in LOCAL time — what <input type="datetime-local">
 *  needs, as opposed to the UTC-based toISOString(). */
export function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
 *  read. `datetime-local` is interpreted by the browser as local time with
 *  no timezone info attached — the label makes explicit the assumption
 *  already baked into toDatetimeLocal/toLocaleString elsewhere in the
 *  project: the admin's device clock is set to Mozambique time. */
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
    ? new Date(value).toLocaleString("pt", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
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
