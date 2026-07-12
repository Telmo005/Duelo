import { db } from "@/db";
import { adminAuditLog, profiles } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export type AdminAction =
  | "password_reset"
  | "settle_match"
  | "void_match"
  | "refund_expired_bets"
  | "reconcile_deposits"
  | "add_match"
  | "edit_match"
  | "delete_match"
  | "import_fixtures";

/** Records an admin action against the append-only audit trail. Best-effort:
 *  a logging failure must never block the underlying admin action, which has
 *  already happened (password changed / match settled) by the time this runs. */
export async function logAdminAction(
  adminId: string,
  action: AdminAction,
  targetUserId: string | null,
  detail: string
): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({ adminId, action, targetUserId, detail });
  } catch (err) {
    console.error("logAdminAction failed", { adminId, action, targetUserId, err });
  }
}

export async function getRecentAdminActions(limit = 20) {
  const rows = await db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit);
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.flatMap((r) => [r.adminId, r.targetUserId].filter((x): x is string => !!x)))];
  const profileRows = await db.select().from(profiles).where(sql`${profiles.id} in ${userIds}`);
  const nameById = new Map(profileRows.map((p) => [p.id, p.displayName]));

  return rows.map((r) => ({
    ...r,
    adminName: nameById.get(r.adminId) ?? "?",
    targetName: r.targetUserId ? nameById.get(r.targetUserId) ?? "?" : null,
  }));
}
