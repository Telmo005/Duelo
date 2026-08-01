import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/admin";
import { getAffiliateOverview, getPlatformSettings } from "@/lib/adminData";
import { getWalletBalance } from "@/lib/wallet";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { AffiliateOverviewList } from "@/components/admin/affiliate-overview-list";

export const metadata: Metadata = { title: "Afiliados | Admin | Duelo" };

export default async function AdminAffiliatesPage() {
  const profile = await requireAdmin();
  const [settings, overview, { availableCents }] = await Promise.all([
    getPlatformSettings(),
    getAffiliateOverview(),
    getWalletBalance(profile.id),
  ]);

  return (
    <AppShell active="feed" displayName={profile.displayName} availableCents={availableCents} currentUserId={profile.id}>
      <div className="mb-7">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Afiliados</h1>
        <p className="mt-1 text-sm text-muted-foreground">Percentagens do programa de afiliados e visão geral de quem já ganhou.</p>
      </div>

      <section className="mb-7">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Percentagens</h2>
        <PlatformSettingsForm
          initialCommissionPct={settings.commissionRateBps / 100}
          initialReferralSharePct={settings.referralShareBps / 100}
        />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Afiliados ({overview.length})
        </h2>
        <AffiliateOverviewList rows={overview} />
      </section>
    </AppShell>
  );
}
