import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getUserStats } from "@/lib/profile";
import { getWalletBalance, formatCentsAsMt } from "@/lib/wallet";
import { LinkPendingSpinner } from "@/components/ui/link-pending-spinner";
import { EditableDisplayName } from "@/components/profile/editable-display-name";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/support";
import { Wallet, Swords, MessageCircle } from "lucide-react";

export const metadata: Metadata = { title: "Perfil | Duelo" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const [stats, { availableCents }] = await Promise.all([
    getUserStats(user.id),
    getWalletBalance(user.id),
  ]);

  const memberSince = new Date(profile.createdAt).toLocaleDateString("pt", { month: "long", year: "numeric" });
  const isPositive = stats.netCents >= 0;

  return (
    <AppShell active="profile" displayName={profile.displayName} availableCents={availableCents} currentUserId={user.id}>
      {/* Header */}
      <div className="mb-7 flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-primary-foreground">
          {profile.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <EditableDisplayName initialName={profile.displayName} />
          <p className="text-sm text-muted-foreground">Membro desde {memberSince}</p>
        </div>
      </div>

      {/* Stats grid */}
      <section className="mb-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Estatísticas</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Apostas totais", value: stats.totalBets },
            { label: "Vitórias", value: stats.wins },
            { label: "Derrotas", value: stats.losses },
            { label: "Taxa de vitória", value: `${stats.winRatePct}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-1 text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-extrabold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-1 text-xs text-muted-foreground">Total apostado</p>
            <p className="text-lg font-extrabold tabular-nums">{formatCentsAsMt(stats.totalWageredCents)} <span className="text-sm font-semibold text-muted-foreground">MT</span></p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-1 text-xs text-muted-foreground">Saldo líquido</p>
            <p className={`text-lg font-extrabold tabular-nums ${isPositive ? "text-success" : "text-destructive"}`}>
              {isPositive ? "+" : ""}{formatCentsAsMt(stats.netCents)} <span className="text-sm font-semibold text-muted-foreground">MT</span>
            </p>
          </div>
        </div>

        {stats.active > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {stats.active} aposta{stats.active > 1 ? "s" : ""} em curso —{" "}
            <Link href="/bets" className="inline-flex items-center gap-1.5 font-bold text-primary">
              ver detalhes
              <LinkPendingSpinner className="size-3" />
            </Link>
          </p>
        )}
      </section>

      {/* Quick links */}
      <section className="mb-7 grid grid-cols-2 gap-3">
        <Link href="/dashboard" className="press flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-10 text-success" aria-hidden>
            <Wallet className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              Carteira
              <LinkPendingSpinner className="size-3" />
            </p>
            <p className="text-xs text-muted-foreground">{formatCentsAsMt(availableCents)} MT</p>
          </div>
        </Link>
        <Link href="/bets" className="press flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-10 text-primary" aria-hidden>
            <Swords className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              Minhas Apostas
              <LinkPendingSpinner className="size-3" />
            </p>
            <p className="text-xs text-muted-foreground">{stats.totalBets} no total</p>
          </div>
        </Link>
      </section>

      {/* Security + support */}
      <section className="mb-7 flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Segurança e suporte</h2>

        <ChangePasswordForm />

        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-10 text-success" aria-hidden>
            <MessageCircle className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-sm font-bold">Falar com o suporte</p>
            <p className="text-xs text-muted-foreground">WhatsApp · {SUPPORT_PHONE_DISPLAY}</p>
          </span>
        </a>
      </section>

      <SignOutButton className="text-sm font-semibold text-muted-foreground hover:text-foreground" />
    </AppShell>
  );
}
