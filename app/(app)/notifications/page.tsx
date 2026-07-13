import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { NotificationItem } from "@/components/notifications/notification-item";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { getUserNotifications } from "@/lib/notifications";
import { getWalletBalance } from "@/lib/wallet";
import { BackLink } from "@/components/ui/back-link";
import { Bell } from "lucide-react";

export const metadata: Metadata = { title: "Notificações | Duelo" };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) redirect("/login");

  const [{ availableCents }, items] = await Promise.all([
    getWalletBalance(user.id),
    getUserNotifications(user.id),
  ]);

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <AppShell active="profile" displayName={profile.displayName} availableCents={availableCents} currentUserId={user.id}>
      <BackLink href="/" label="Feed" className="mb-5" />

      <div className="mb-7 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Notificações</h1>
        {hasUnread && <MarkAllReadButton />}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
            <Bell className="size-7" />
          </div>
          <p className="mb-2 text-base font-bold">Ainda não tens notificações</p>
          <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">
            Avisamos-te quando alguém aceitar um desafio, uma aposta for liquidada, ou um pagamento for processado.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((n, i) => (
            <div key={n.id} className={i > 0 ? "border-t border-border" : ""}>
              <NotificationItem notification={n} />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
