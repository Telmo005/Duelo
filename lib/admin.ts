import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Gate for /admin/* pages. Redirects non-admins to the feed — no error
 *  page, so this doesn't confirm to a snooping user whether the route
 *  exists. Single is_admin boolean for now (see db/schema.ts profiles). */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile || !profile.isAdmin) redirect("/");

  return profile;
}
