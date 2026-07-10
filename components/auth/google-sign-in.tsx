"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Spinner } from "@/components/ui/spinner";

export function GoogleSignInButton({ label = "Continuar com Google" }: { label?: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setError(null);
    setIsPending(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    // Success redirects the whole page away — if we're still here, it failed.
    if (oauthError) {
      setError("Não foi possível ligar ao Google. Tenta novamente.");
      setIsPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isPending}
        className="press flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-secondary px-5 py-3.5 text-[15px] font-bold tracking-tight text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Spinner />
            A ligar ao Google…
          </span>
        ) : (
          <>
            {/* Google logo SVG */}
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.2-2.7-.5-4z" fill="#FFC107"/>
              <path d="M6.3 14.7l7 5.1C15.2 16.4 19.3 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.4 4.4-17.7 11.7z" fill="#FF3D00"/>
              <path d="M24 43c5.5 0 10.4-1.8 14.3-5l-6.6-5.6C29.7 34 27 35 24 35c-6.1 0-10.7-3.1-11.8-7.5l-7 5.4C8 38.5 15.4 43 24 43z" fill="#4CAF50"/>
              <path d="M44.5 20H24v8.5h11.8c-.9 2.7-2.8 5-5.4 6.5l6.6 5.6C41.6 37.5 44 31 44 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2"/>
            </svg>
            {label}
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
