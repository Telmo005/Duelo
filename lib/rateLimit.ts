import { db } from "@/db";
import { authAttempts } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";

/** Sliding window: how far back attempts count against the caller. */
const WINDOW_MS = 15 * 60 * 1000;
/** Failed attempts for the same phone within the window before lockout. */
const MAX_FAILED_PER_PHONE = 5;
/** Failed attempts from the same IP within the window before lockout —
 *  a looser ceiling than per-phone, since one IP legitimately covers a
 *  household/office, but still catches someone sweeping many numbers. */
const MAX_FAILED_PER_IP = 20;

export type RateLimitResult = { allowed: true } | { allowed: false; message: string };

/**
 * Checks whether a login attempt for this phone/IP should be allowed
 * before ever calling Supabase Auth. The synthetic-email identity
 * (see lib/actions/auth.ts) is derivable from any known phone number,
 * so this window is the actual defense against password brute-forcing.
 */
export async function checkLoginRateLimit(phone: string, ip: string | null): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS);

  const [byPhone] = await db
    .select({ count: sql<number>`count(*)` })
    .from(authAttempts)
    .where(and(eq(authAttempts.phone, phone), eq(authAttempts.success, false), gt(authAttempts.createdAt, since)));

  if (Number(byPhone?.count ?? 0) >= MAX_FAILED_PER_PHONE) {
    return { allowed: false, message: "Demasiadas tentativas para este número. Tenta novamente daqui a alguns minutos." };
  }

  if (ip) {
    const [byIp] = await db
      .select({ count: sql<number>`count(*)` })
      .from(authAttempts)
      .where(and(eq(authAttempts.ip, ip), eq(authAttempts.success, false), gt(authAttempts.createdAt, since)));

    if (Number(byIp?.count ?? 0) >= MAX_FAILED_PER_IP) {
      return { allowed: false, message: "Demasiadas tentativas a partir desta rede. Tenta novamente mais tarde." };
    }
  }

  return { allowed: true };
}

/** Records the outcome of a login attempt — call after every signIn call,
 *  success or failure, so the window above reflects reality. */
export async function recordLoginAttempt(phone: string, ip: string | null, success: boolean): Promise<void> {
  await db.insert(authAttempts).values({ phone, ip, success });
}
