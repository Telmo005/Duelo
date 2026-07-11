/** Our forms allow optional spaces for readability ("+258 84 XXX XXXX") —
 *  strip them before a phone number is used as a lookup key, stored, or
 *  sent to Supabase. Shared by auth and admin actions so a phone always
 *  normalizes to the exact same string everywhere it's compared. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}
