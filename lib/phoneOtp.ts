/**
 * Shared helpers for the phone-verification-at-registration OTP flow —
 * used by both lib/actions/phoneVerification.ts (request/send) and
 * lib/actions/auth.ts's registerUser (verify/consume). Plain module, not
 * "use server" — a server actions file may only export async functions,
 * and generateCode/hashCode are synchronous.
 */
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { phoneOtps } from "@/db/schema";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Codes are short-lived (10 min), single-use, and already rate-limited
 *  per phone/IP (see lib/rateLimit.ts's checkOtpRequestRateLimit) — a plain
 *  unsalted SHA-256 is proportional here, same reasoning as the HMAC used
 *  for webhook signatures elsewhere in this app; no need for a slow KDF. */
export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Checks `code` against the pending OTP row for `phone`, enforcing expiry
 * and a max-attempts ceiling (each wrong guess increments the row's
 * attempts — never reset except by requesting a fresh code). Never throws.
 *
 * Deliberately does NOT delete the row on success — see consumeOtp below
 * for why that has to be a separate, later step.
 */
export async function verifyOtp(phone: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [otpRow] = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, phone)).limit(1);

  if (!otpRow) {
    return { ok: false, error: "Pede um código de verificação primeiro." };
  }
  if (otpRow.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Código expirado. Pede um novo código." };
  }
  if (otpRow.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: "Demasiadas tentativas. Pede um novo código." };
  }
  if (hashOtpCode(code) !== otpRow.codeHash) {
    await db.update(phoneOtps).set({ attempts: otpRow.attempts + 1 }).where(eq(phoneOtps.phone, phone));
    return { ok: false, error: "Código incorreto." };
  }

  return { ok: true };
}

/**
 * Deletes the OTP row for `phone` — single-use, call ONLY once registerUser
 * has fully committed the new account (auth user + profile + wallet all
 * created). Calling this right after verifyOtp succeeds (instead of at the
 * end of registration) was the original design and had a real bug: if
 * account creation then failed for an unrelated reason (e.g. a transient
 * wallet_ensure error), the code was already gone, and the user's retry —
 * same phone, same code, now sitting right there in the still-filled-in
 * form — would fail with "Pede um código de verificação primeiro." instead
 * of just working, forcing an unnecessary second SMS for a failure that had
 * nothing to do with the phone number being real. profiles.phone's own
 * unique constraint (profiles_phone_key) is what actually prevents two
 * accounts from one code, so deferring the delete to here doesn't weaken
 * that guarantee.
 */
export async function consumeOtp(phone: string): Promise<void> {
  await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));
}
