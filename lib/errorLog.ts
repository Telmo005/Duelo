import { db } from "@/db";
import { errorLog } from "@/db/schema";
import { desc } from "drizzle-orm";

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
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  const detail = context || stack ? JSON.stringify({ ...context, stack }) : null;

  try {
    await db.insert(errorLog).values({ source, message, detail });
  } catch (dbErr) {
    console.error(`logError: failed to persist error from ${source}`, { message, dbErr });
  }
}

/** Most recent failures across every source, for /admin/errors. */
export async function getRecentErrors(limit = 100) {
  return db.select().from(errorLog).orderBy(desc(errorLog.createdAt)).limit(limit);
}
