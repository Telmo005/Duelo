"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { displayNameSchema } from "@/lib/validation/auth";

type ActionResult = { error?: string };

/** updateDisplayName — the only self-service profile edit for now (phone
 *  is the account identity, so changing it would need its own re-verification
 *  flow — out of scope until there's a real reason to support it). */
export async function updateDisplayName(input: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Sessão expirada. Entra novamente." };
  }

  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nome inválido" };
  }

  await db.update(profiles).set({ displayName: parsed.data }).where(eq(profiles.id, user.id));

  // Broad revalidate: displayName is rendered by every AppShell/SiteHeader
  // caller across the app (sidebar, mobile top bar, admin pages, etc.).
  revalidatePath("/", "layout");
  return {};
}
