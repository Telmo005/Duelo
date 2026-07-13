import { db } from "@/db";
import { notifications, type Notification } from "@/db/schema";
import { eq, and, isNull, desc, count } from "drizzle-orm";

/** Shown as the bell badge in AppShell — kept cheap (a count, not the rows)
 *  since this runs on every authenticated page load. */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function getUserNotifications(userId: string, limit = 30): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
