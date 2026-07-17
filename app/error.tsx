"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { logClientError } from "@/lib/actions/errors";

/**
 * Catches any uncaught error thrown while rendering a page under the root
 * layout (a transient DB/Supabase hiccup, a network blip on the server
 * side — the "variable mobile network conditions" this whole project is
 * built around). Without this, Next.js has no branded fallback and the
 * browser shows its own bare "This page couldn't load" page — jarring, and
 * gives the user no obvious way back into the app. Must be a Client
 * Component (Next.js convention for error.tsx) since it needs the reset()
 * callback and an effect to log the error.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled page error:", error);
    logClientError(error.message, error.stack ?? null, typeof window !== "undefined" ? window.location.href : undefined).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive-10 text-destructive">
        <AlertTriangle className="size-8" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Algo correu mal</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Foi um problema temporário — o teu saldo e as tuas apostas estão seguros. Tenta novamente.
        </p>
      </div>
      <div className="flex w-full max-w-64 flex-col gap-2.5">
        <ActionButton type="button" size="md" block icon={<RotateCcw className="size-4" aria-hidden />} onClick={reset}>
          Tentar novamente
        </ActionButton>
        <Link
          href="/"
          className="press flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent"
        >
          Voltar ao feed
        </Link>
      </div>
    </div>
  );
}
