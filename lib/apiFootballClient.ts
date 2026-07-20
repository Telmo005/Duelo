import { db } from "@/db";
import { liveSyncState } from "@/db/schema";
import { eq } from "drizzle-orm";

const BASE_URL = "https://v3.football.api-sports.io";

export type ApiFootballResponse<T = unknown> = {
  body?: T;
  error?: string;
  /** Requests remaining today, as reported by the vendor on THIS call
   *  (x-ratelimit-requests-remaining) — undefined if the header was missing
   *  (network failure before a response, or an unexpected vendor change). */
  remaining?: number;
};

/**
 * The single chokepoint every API-Football HTTP call goes through — team
 * search, fixture search, per-match/bulk live lookups, all of it. Two jobs:
 * (1) attach the API key consistently, (2) read
 * `x-ratelimit-requests-remaining` off every response and persist it to
 * live_sync_state, at zero extra cost (the header is already there on every
 * response we'd be making anyway). That persisted number is what
 * lib/liveScoreSync.ts checks before spending a request on an automatic
 * poll — real, vendor-reported budget, not a self-maintained counter that
 * could drift if a request fails silently or something outside this
 * codebase (the RapidAPI/api-sports.io dashboard, a manual curl) also uses
 * the key.
 */
export async function apiFootballFetch<T = unknown>(path: string): Promise<ApiFootballResponse<T>> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return { error: "API_FOOTBALL_KEY não está configurada" };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const remainingHeader = res.headers.get("x-ratelimit-requests-remaining");
  const remaining = remainingHeader != null ? Number(remainingHeader) : undefined;
  if (remaining != null && Number.isFinite(remaining)) {
    await persistQuotaRemaining(remaining);
  }

  if (!res.ok) return { error: `Pedido falhou (HTTP ${res.status})`, remaining };

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), remaining };
  }

  const errors = (body as { errors?: unknown })?.errors;
  if (errors && typeof errors === "object" && Object.keys(errors).length > 0) {
    const messages = Object.values(errors as Record<string, string>);
    return { error: messages.join(" ") || "A API rejeitou o pedido", remaining };
  }

  return { body: body as T, remaining };
}

async function persistQuotaRemaining(remaining: number): Promise<void> {
  await db
    .update(liveSyncState)
    .set({ quotaRemaining: remaining, quotaUpdatedAt: new Date() })
    .where(eq(liveSyncState.id, 1));
}

/** The last vendor-reported quota reading, if recent enough to trust.
 *  "Recent enough" = same UTC calendar day as now — API-Football's quota is
 *  daily, so a reading from yesterday tells us nothing about today's
 *  remaining budget. Returns null when there's no trustworthy reading yet
 *  (first call of the day, or the sync has never run) — callers should
 *  treat null as "unknown, proceed conservatively" rather than "zero". */
export async function getKnownRemainingQuota(): Promise<number | null> {
  const [row] = await db.select().from(liveSyncState).where(eq(liveSyncState.id, 1)).limit(1);
  if (!row || row.quotaRemaining == null || !row.quotaUpdatedAt) return null;

  const updatedAt = new Date(row.quotaUpdatedAt);
  const now = new Date();
  const sameUtcDay =
    updatedAt.getUTCFullYear() === now.getUTCFullYear() &&
    updatedAt.getUTCMonth() === now.getUTCMonth() &&
    updatedAt.getUTCDate() === now.getUTCDate();

  return sameUtcDay ? row.quotaRemaining : null;
}
