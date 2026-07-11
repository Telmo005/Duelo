import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { UserPasswordReset } from "@/components/admin/user-password-reset";
import { requireAdmin } from "@/lib/admin";
import { getWalletBalance } from "@/lib/wallet";

export const metadata: Metadata = { title: "Recuperação de conta | Duelo" };

/**
 * Support-assisted password reset (ADMIN-05 equivalent). With no SMS/email
 * channel wired up yet, this is how a verified support request (phone call/
 * WhatsApp) gets turned into a new password — an admin looks the user up by
 * phone and sets it directly via the Supabase Admin API.
 */
export default async function AdminUsersPage() {
  const profile = await requireAdmin();
  const { availableCents } = await getWalletBalance(profile.id);

  return (
    <AppShell active="feed" displayName={profile.displayName} availableCents={availableCents} currentUserId={profile.id}>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Recuperação de conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirma a identidade do utilizador (nome, número, detalhes da conta) antes de repor a password.
          </p>
        </div>
        <Link href="/admin" className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-accent">
          ← Admin
        </Link>
      </div>

      <UserPasswordReset />
    </AppShell>
  );
}
