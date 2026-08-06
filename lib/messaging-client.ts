/**
 * Client for the shared messaging gateway (SMS + Android push to the
 * system owner's device) — a different project's app, not to be modified
 * from here. Same shape as lib/paygate-client.ts (thin fetch wrapper,
 * bearer token, never throw past this file) but there's no webhook/
 * callback side to this one: both endpoints just queue and deliver within
 * ~15s on the gateway's own side.
 *
 * Env vars (server-side only — never expose to the client, never commit):
 *   MESSAGING_BASE_URL = https://<gateway-domain>
 *   MESSAGING_API_KEY  = <bearer token the gateway issued this app>
 *
 * Named MESSAGING_*, not CRON_SECRET (which the gateway's own docs happen
 * to call this token) — this app already has its own CRON_SECRET
 * (lib/cronAuth.ts) guarding /api/cron/*, an unrelated, oppositely-directed
 * secret (that one authenticates callers INTO this app; this one
 * authenticates this app OUT to the gateway). Reusing the name would
 * silently collide.
 */
type SendResult = { ok: true; id: string } | { ok: false; error: string };

// Neither of this file's endpoints should ever take long to just ENQUEUE a
// message (the ~15s figure in the gateway's docs is its own delivery time,
// not this call) — but `fetch` has no default timeout, and sendPush is now
// called from inside lib/errorLog.ts's logError, which runs on a huge
// fraction of this app's error paths (webhook handlers, cron routes, rate
// limiters). Without a hard ceiling, a hung/slow gateway would turn every
// one of those into an accidental blocking dependency on a third-party
// service — exactly what "never blocking" is supposed to prevent.
const REQUEST_TIMEOUT_MS = 8_000;

function config(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.MESSAGING_BASE_URL;
  const apiKey = process.env.MESSAGING_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

/**
 * Sends a real SMS. `to` must already be E.164 (+258...) — every phone
 * number in this app is already stored in that shape (lib/phone.ts's
 * normalizePhone + the +258 8[2-7] validation in lib/validation/auth.ts).
 * Never throws. Callers that need to know whether the message actually got
 * queued (e.g. phone verification — no code reaches the user if this
 * fails) should check `.ok`; purely fire-and-forget callers can ignore the
 * result.
 */
export async function sendSms(to: string, message: string): Promise<SendResult> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "MESSAGING_BASE_URL/MESSAGING_API_KEY não configurados" };

  try {
    const res = await fetch(`${cfg.baseUrl}/api/internal/messages/sms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, message }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.id) {
      return { ok: false, error: `sendSms falhou: ${res.status} ${JSON.stringify(json)}` };
    }
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Every push always shows this as its title — the notification should
 *  read as coming from the app itself, not as a one-off label per event
 *  type. Kept here (not imported from anywhere else) since this is the
 *  one file that talks to the gateway; nothing else needs the app name. */
const APP_NAME = "DueloBet";

/**
 * Fires an Android push notification to the system owner's own device via
 * the gateway's celular-gateway — NOT a per-user SMS, this endpoint has no
 * `to` field at all. Genuinely fire-and-forget: never throws, so a gateway
 * outage can never take down whichever real operation it's attached to (a
 * withdrawal request, a deposit credit, ...). Still `await` it at call
 * sites (don't leave the promise dangling) so the serverless function
 * doesn't get torn down mid-fetch right after the response is returned.
 *
 * The notification's title is always the app name (see APP_NAME) — `subject`
 * and `description` both go into the body instead, laid out like an email
 * (subject line, blank line, description), so every call site still passes
 * exactly the same two strings it always did (what event happened, and the
 * details) without needing to change.
 *
 * Deliberately logs failures with console.error only, NOT lib/errorLog.ts's
 * logError — logError itself calls sendPush for the "erro registado"
 * admin-notification hook, so sendPush calling back into logError would
 * recurse (error logged → push attempted → push fails → error logged →
 * ...). A messaging-gateway outage is still visible in Vercel's function
 * logs; it just doesn't get a durable /admin/errors row of its own.
 */
export async function sendPush(subject: string, description: string): Promise<void> {
  const cfg = config();
  const body = `${subject}\n\n${description}`;
  if (!cfg) {
    console.error("sendPush: MESSAGING_BASE_URL/MESSAGING_API_KEY não configurados, a ignorar", { subject });
    return;
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/api/internal/messages/push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: APP_NAME, body: body.slice(0, 500) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`sendPush falhou: ${res.status} ${text}`, { subject });
    }
  } catch (err) {
    console.error("sendPush: fetch falhou", { subject, err });
  }
}
