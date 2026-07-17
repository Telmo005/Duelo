import { timingSafeEqual } from "node:crypto";

/**
 * Guards every /api/cron/* route. Two things the plain
 * `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` check used to get
 * wrong: (1) if CRON_SECRET is unset, that comparison becomes
 * `authHeader !== "Bearer undefined"` — a literal string any caller can
 * send, silently authorizing every request; (2) `!==` on secrets is a
 * variable-time comparison, leaking timing information about how many
 * leading bytes matched. Neither is exploitable for much here (these
 * routes are idempotent, no data exfiltration), but there's no reason not
 * to close both properly.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
