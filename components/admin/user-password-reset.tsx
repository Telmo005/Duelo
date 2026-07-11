"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { findUserByPhoneAction, adminResetPasswordAction } from "@/lib/actions/admin-users";
import { Spinner } from "@/components/ui/spinner";

type FoundUser = { id: string; displayName: string; phone: string; createdAt: string };

function randomPassword(): string {
  // Not cryptographic — this is a temporary password the admin reads out
  // over a call; the user should change it once logged back in.
  return Math.random().toString(36).slice(2, 10);
}

export function UserPasswordReset() {
  const [phone, setPhone] = useState("+258 ");
  const [isSearching, startSearch] = useTransition();
  const [found, setFound] = useState<FoundUser | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [isResetting, startReset] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setFound(null);
    startSearch(async () => {
      const result = await findUserByPhoneAction(phone);
      if (result.error) setSearchError(result.error);
      else if (result.user) setFound(result.user);
    });
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!found || !newPassword) return;
    startReset(async () => {
      const result = await adminResetPasswordAction(found.id, newPassword);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Password reposta. Comunica-a ao utilizador com segurança.");
        setNewPassword("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="tel"
          inputMode="tel"
          maxLength={16}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onFocus={(e) => {
            const el = e.currentTarget;
            requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
          }}
          placeholder="+258 84 XXX XXXX"
          className="w-full max-w-xs rounded-lg border border-border bg-card px-3.5 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="press flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSearching && <Spinner className="size-3.5" />}
          {isSearching ? "A procurar…" : "Procurar"}
        </button>
      </form>

      {searchError && (
        <p className="text-sm text-destructive">{searchError}</p>
      )}

      {found && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold">{found.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {found.phone} · membro desde {new Date(found.createdAt).toLocaleDateString("pt", { day: "2-digit", month: "2-digit", year: "numeric" })}
          </p>

          <form onSubmit={handleReset} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              maxLength={72}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nova password"
              className="w-full max-w-xs rounded-lg border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewPassword(randomPassword())}
                className="press rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent"
              >
                Gerar
              </button>
              <button
                type="submit"
                disabled={isResetting || newPassword.length < 4}
                className="press flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResetting && <Spinner className="size-3.5" />}
                {isResetting ? "A repor…" : "Definir password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
