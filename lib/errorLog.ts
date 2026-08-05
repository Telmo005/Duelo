import { db } from "@/db";
import { errorLog } from "@/db/schema";
import { desc } from "drizzle-orm";
import { sendPush } from "@/lib/messaging-client";

/**
 * Pulls a real message (and whatever other fields are useful) out of
 * whatever a caller happened to pass in. Several cron routes pass a
 * Supabase/Postgrest error straight through (e.g. `const { error } =
 * await supabase.rpc(...); logError(source, error)`) — that's a plain
 * object (`{ message, details, hint, code }`), never an `Error` instance,
 * so `String(error)` on it degrades to the useless literal "[object
 * Object]" — exactly what several /admin/errors entries showed instead of
 * the actual Postgres error. Anything with a string `.message` gets that
 * extracted, with its other fields (details/hint/code) kept in `extra` for
 * the detail column instead of silently dropped.
 */
function extractErrorInfo(error: unknown): { message: string; extra: Record<string, unknown> | null } {
  if (error instanceof Error) {
    return { message: error.message, extra: error.stack ? { stack: error.stack } : null };
  }
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as Record<string, unknown>).message === "string") {
    const { message, ...rest } = error as Record<string, unknown>;
    return { message: message as string, extra: Object.keys(rest).length > 0 ? rest : null };
  }
  return { message: String(error), extra: null };
}

/**
 * Persists a server-side failure to the error_log table — the durable trail
 * console.error alone never gave us (Vercel's function logs are ephemeral
 * and nobody's watching them at 3am). Best-effort, same contract as
 * lib/adminAudit.ts's logAdminAction: a logging failure must never throw or
 * block the caller, which has usually already done its own error handling
 * (returned a 500, left a deposit 'pending' for the reconciliation job,
 * etc.) by the time this runs. Falls back to console.error if the DB write
 * itself fails, so a total DB outage doesn't leave literally zero trace.
 */
export async function logError(source: string, error: unknown, context?: Record<string, unknown>): Promise<void> {
  const { message, extra } = extractErrorInfo(error);
  const detail = context || extra ? JSON.stringify({ ...context, ...extra }) : null;

  try {
    await db.insert(errorLog).values({ source, message, detail });
  } catch (dbErr) {
    console.error(`logError: failed to persist error from ${source}`, { message, dbErr });
  }

  // Admin push per logged error — sendPush never throws and logs its own
  // failures with console.error only (not logError), so this can never
  // recurse. See lib/messaging-client.ts.
  await sendPush(`Erro: ${source}`, message);
}

/** Most recent failures across every source, for /admin/errors. */
export async function getRecentErrors(limit = 100) {
  return db.select().from(errorLog).orderBy(desc(errorLog.createdAt)).limit(limit);
}

/** Wipes the whole error log — /admin/errors' "Limpar" action. Nothing else
 *  reads this table (it's a durable trail for humans to notice failures,
 *  not something settlement/wallet logic depends on), so clearing it has no
 *  effect beyond the admin view resetting to empty. */
export async function clearErrorLog(): Promise<void> {
  await db.delete(errorLog);
}
