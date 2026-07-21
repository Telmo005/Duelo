import { getQuotaStatus } from "@/lib/apiFootballClient";
import { MOZAMBIQUE_TIMEZONE } from "@/lib/format";

/** Tiers mirror lib/liveScoreSync.ts's QUOTA_CAUTION_REMAINING/
 *  QUOTA_WARNING_REMAINING/QUOTA_SAFETY_RESERVE — same thresholds the
 *  automatic sync itself backs off at, so what the admin sees here always
 *  matches what's actually about to happen (slower updates, then a full
 *  stop) rather than just being a decorative number. */
function tierClassName(remaining: number): string {
  // Literal -30 tokens only exist for primary/destructive (see
  // app/globals.css) — never use a bare /N opacity modifier on these custom
  // colors (breaks on browsers without color-mix() support, e.g. Opera
  // Mini). success/locked fall back to their solid border instead.
  if (remaining <= 15) return "border-destructive-30 bg-destructive-10 text-destructive";
  if (remaining <= 30) return "border-locked bg-locked-10 text-locked";
  if (remaining <= 50) return "border-primary-30 bg-primary-10 text-primary";
  return "border-success bg-success-10 text-success";
}

/**
 * Server-rendered stat showing today's API-Football usage — the vendor's
 * own reported numbers (x-ratelimit-requests-remaining/-limit, persisted by
 * every call via lib/apiFootballClient.ts), not a guess. Satisfies "quero
 * ver quantos pedidos foram usados" without needing a separate notification
 * for every tier change — the admin can just look whenever they want.
 */
export async function ApiQuotaBadge() {
  const { remaining, limit, updatedAt } = await getQuotaStatus();

  // remaining is the number that actually gates the automatic sync — show
  // it whenever known, even before `limit` has been read (e.g. right after
  // this field was added, before the next real API call refreshes it).
  if (remaining == null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
        Pedidos API-Football: sem dados hoje
      </span>
    );
  }

  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("pt", { hour: "2-digit", minute: "2-digit", timeZone: MOZAMBIQUE_TIMEZONE })
    : null;
  const label = limit != null ? `${limit - remaining}/${limit} usados (${remaining} restantes)` : `${remaining} restantes hoje`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold tabular-nums ${tierClassName(remaining)}`}
      title={time ? `Última leitura: ${time}` : undefined}
    >
      Pedidos API: {label}
    </span>
  );
}
