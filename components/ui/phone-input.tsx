"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Countries this field can select. Only Mozambique is a real option — the
 *  whole product (payments, settlement, phone validation in
 *  lib/validation/auth.ts) is Mozambique-only in v1 — but this is built as
 *  a real list rather than a hardcoded prefix so a second country later is
 *  a one-line addition, not a rewrite. */
const COUNTRIES = [{ code: "+258", name: "Moçambique" }] as const;

/** Formats raw digits as "84 123 4567" (Mozambican mobile: 2 + 3 + 4),
 *  capped at 9 digits. */
function formatSubscriberNumber(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 9)].filter(Boolean).join(" ");
}

/**
 * Phone number field: a country-code picker (defaults to, and for now only
 * offers, Mozambique) next to a digits-only input for the subscriber
 * number. Composes both into a single hidden `name`-bound input holding the
 * full "+258 84 123 4567" string lib/validation/auth.ts expects — so
 * callers (login/register forms, FormData.get("phone")) don't change.
 *
 * Replaces the previous design of gluing "+258 " into one editable text
 * field: a fixed, deletable prefix sharing a cursor with user input is
 * exactly the kind of thing that produces cursor-jump/autofill glitches,
 * and it looked like a plain text field rather than "pick your country".
 */
export function PhoneInput({
  id,
  name,
  defaultValue,
  required,
  disabled,
  autoComplete,
  className,
}: {
  id: string;
  name: string;
  /** Legacy shape from the old single-field design, e.g. "+258 " or
   *  "+258 84 123 4567" — the country code prefix is stripped back out. */
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  const initialDigits = (defaultValue ?? "").replace(/^\+258\s?/, "");
  const [digits, setDigits] = useState(formatSubscriberNumber(initialDigits));
  const country = COUNTRIES[0];
  const fullValue = digits ? `${country.code} ${digits}` : "";

  return (
    <div className="flex items-stretch gap-2">
      <div className="relative shrink-0">
        <select
          aria-label="Prefixo do país"
          disabled={disabled}
          defaultValue={country.code}
          className="h-11 appearance-none rounded-xl border border-border bg-card py-0 pl-4 pr-7 text-[15px] font-bold outline-none focus:border-primary disabled:opacity-50"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        placeholder="84 XXX XXXX"
        value={digits}
        onChange={(e) => setDigits(formatSubscriberNumber(e.target.value))}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        maxLength={11}
        className={cn("h-11 rounded-xl px-4 text-[15px]", className)}
      />

      <input type="hidden" name={name} value={fullValue} />
    </div>
  );
}
