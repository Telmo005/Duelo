"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { phoneOtps } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/messaging-client";
import { getRequestFingerprint } from "@/lib/requestInfo";
import { checkOtpRequestRateLimit, recordOtpRequestAttempt } from "@/lib/rateLimit";
import { logError } from "@/lib/errorLog";
import { generateOtpCode, hashOtpCode, OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS } from "@/lib/phoneOtp";

// Same shape as registerSchema's phone field (lib/validation/auth.ts) —
// kept independent since this action only ever needs the phone.
const phoneOnlySchema = z.object({
  phone: z.string().regex(/^\+258\s?8[2-7]\s?\d{3}\s?\d{4}$/, "Número inválido. Formato: +258 84 XXX XXXX"),
});

type ActionResult = { error?: string };

/**
 * requestPhoneVerification — sends a 6-digit SMS code to `phone` and
 * stores its hash for registerUser (lib/actions/auth.ts) to check against
 * before actually creating the account. Called from the register form
 * before its first submit; the UI then reveals a code field and re-submits
 * through registerUser with the code attached.
 */
export async function requestPhoneVerification(input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = phoneOnlySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Número inválido" };
  }

  const phone = normalizePhone(parsed.data.phone);
  const { ip } = await getRequestFingerprint();

  // Fail OPEN, same reasoning as the login/register rate limiters — a DB
  // hiccup here shouldn't stop a real person from getting their code.
  try {
    const rateLimit = await checkOtpRequestRateLimit(phone, ip);
    if (!rateLimit.allowed) {
      return { error: rateLimit.message };
    }
  } catch (err) {
    console.error("checkOtpRequestRateLimit failed, allowing attempt through:", err);
    await logError("phone_otp", err, { stage: "check_rate_limit", phone });
  }

  // Resend cooldown — reads the previous row directly (a plain time check,
  // no extra table) rather than the rate limiter above, since "wait 60s
  // before the NEXT one" is a different rule than "at most N per window".
  const [existing] = await db.select().from(phoneOtps).where(eq(phoneOtps.phone, phone)).limit(1);
  if (existing) {
    const elapsedMs = Date.now() - existing.createdAt.getTime();
    if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000);
      return { error: `Aguarda ${waitSec}s antes de pedires outro código.` };
    }
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Upsert on the unique phone index — a new request always overwrites
  // whatever code was previously pending for this number, so only the
  // latest SMS sent is ever valid.
  await db
    .insert(phoneOtps)
    .values({ phone, codeHash, expiresAt, ip })
    .onConflictDoUpdate({
      target: phoneOtps.phone,
      set: { codeHash, attempts: 0, expiresAt, ip, createdAt: new Date() },
    });

  try {
    await recordOtpRequestAttempt(phone, ip);
  } catch (err) {
    console.error("recordOtpRequestAttempt failed:", err);
  }

  // No SMS provider "branded sender" for this app yet — the message comes
  // from what looks like an ordinary phone number, so the greeting/layout
  // itself has to carry the "this is really DueloBet" signal instead.
  // Chosen deliberately over a terser accent-free one-liner: this reads as
  // 3 SMS segments (accents force UCS-2 encoding, which caps a concatenated
  // segment at 67 chars, vs. 153 for plain GSM-7 — this message runs well
  // past that on its own), so roughly 3x the per-code cost. Worth it for
  // the tone at current volume; revisit if OTP volume ever makes that add
  // up (a shorter, accent-free variant would fit in one segment).
  const sms = await sendSms(
    phone,
    `Bem-vindo a DueloBet,\n\nPara concluíres o registo, confirma o teu número com o código:\n\n${code}\n\nVálido por 10 minutos.`
  );
  if (!sms.ok) {
    await logError("phone_otp", sms.error, { stage: "send_sms", phone });
    return { error: "Não foi possível enviar o SMS. Tenta novamente." };
  }

  return {};
}
