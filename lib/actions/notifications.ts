"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Marks a single notification read, or every unread one if id is omitted —
 *  both scoped server-side to the caller's own auth.uid() (also enforced a
 *  second time inside notifications_mark_read itself), so a client can
 *  never mark another user's notification as read. */
export async function markNotificationReadAction(id?: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();
  await service.rpc("notifications_mark_read", { p_user_id: user.id, p_notification_id: id ?? null });

  revalidatePath("/notifications");
}
