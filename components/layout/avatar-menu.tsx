"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { User, LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { Spinner } from "@/components/ui/spinner";

/**
 * The circular initial avatar in the mobile header — used to just be a
 * plain link straight to /perfil. That meant "sign out" was only reachable
 * by opening the profile page and scrolling to find the text link at the
 * bottom, on every single page. This turns it into a small menu (ver perfil
 * / terminar sessão) so signing out is one tap from anywhere in the app.
 */
export function AvatarMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Menu de ${displayName}`}
        aria-expanded={open}
        className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-popover shadow-[var(--shadow-card)]">
          <Link
            href="/perfil"
            onClick={() => setOpen(false)}
            className="press flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold hover:bg-accent"
          >
            <User className="size-4 text-muted-foreground" aria-hidden />
            Ver perfil
          </Link>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setOpen(false);
              startTransition(() => signOut());
            }}
            className="press flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive-10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? <Spinner className="size-4" /> : <LogOut className="size-4" aria-hidden />}
            {isPending ? "A terminar sessão…" : "Terminar sessão"}
          </button>
        </div>
      )}
    </div>
  );
}
