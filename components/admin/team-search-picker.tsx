"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Search, Check } from "lucide-react";
import { searchTeamsAction } from "@/lib/actions/matches";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { TeamSearchResult } from "@/lib/sportsData";

/**
 * "Pesquisar equipa" — an optional live search (API-Football) that lets an
 * admin pick a team by its real, official name instead of typing one by
 * hand. Exists because guessing a crest from a hand-typed name silently
 * fails for two reasons: the API rejects non-ASCII characters outright, and
 * it only knows English/official names, so a Portuguese name like "Espanha"
 * matches nothing while "Spain" works instantly. Picking from real results
 * sidesteps both, and fills in the crest for free.
 *
 * Purely additive: the underlying text input is still there and still
 * editable by hand (for Moçambola clubs API-Football has never heard of —
 * no crest either way, exactly like before this picker existed).
 */
export function TeamSearchPicker({
  id,
  label,
  name,
  logoFieldName,
  placeholder,
  disabled,
  defaultValue = "",
  defaultLogoUrl = "",
}: {
  id: string;
  label: string;
  name: string;
  logoFieldName: string;
  placeholder: string;
  disabled?: boolean;
  /** Pre-fills the field when editing an existing match. */
  defaultValue?: string;
  defaultLogoUrl?: string;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [logoUrl, setLogoUrl] = useState(defaultLogoUrl);
  const [results, setResults] = useState<TeamSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleChange(value: string) {
    setQuery(value);
    setLogoUrl(""); // typing again after a pick means "no longer that exact team"
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const teams = await searchTeamsAction(value);
      setResults(teams);
      setLoading(false);
    }, 350);
  }

  function pick(team: TeamSearchResult) {
    setQuery(team.name);
    setLogoUrl(team.logo);
    setResults([]);
    setOpen(false);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          required
          disabled={disabled}
          maxLength={100}
          autoComplete="off"
          className="pr-8"
        />
        <input type="hidden" name={name} value={query} />
        <input type="hidden" name={logoFieldName} value={logoUrl} />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Spinner className="size-3.5" /> : logoUrl ? <Check className="size-3.5 text-success" /> : <Search className="size-3.5" />}
        </span>
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-[var(--shadow-card)]">
          {results.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => pick(team)}
              className="press flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Image src={team.logo} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" />
              <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{team.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
