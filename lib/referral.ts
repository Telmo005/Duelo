import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";

// 32 symbols, deliberately excluding 0/O/1/I/L — those are the pairs people
// misread when a code is dictated over a phone call or handwritten, and this
// code is meant to travel by voice/WhatsApp text as much as by link.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 7;

/** generateReferralCode — random short code, e.g. "K7M2QRX". 32^7 possible
 *  values; registerUser retries on the rare unique-constraint collision
 *  rather than relying on this being collision-free by construction. */
export function generateReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** referralCodeExists — used by /r/[code] to decide whether to forward the
 *  code to /register?ref= or drop it silently (an unknown code in a stale/
 *  mistyped share link should never break the landing page). */
export async function referralCodeExists(code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`upper(${profiles.referralCode}) = upper(${code})`)
    .limit(1);
  return !!row;
}
