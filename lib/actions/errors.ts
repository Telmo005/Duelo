"use server";

import { revalidatePath } from "next/cache";
import { logError, clearErrorLog } from "@/lib/errorLog";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";

/** Lets the client-side error boundary (app/error.tsx) persist a render
 *  error the same way every server-side failure already does — otherwise a
 *  crash in the browser only ever reached that one person's console, with
 *  no trace for anyone to notice or investigate later. */
export async function logClientError(message: string, clientStack: string | null, url?: string): Promise<void> {
  await logError("client_error_boundary", message, { clientStack, url });
}

/** Wipes the error log — /admin/errors' "Limpar" action, for once the admin
 *  has read/investigated the current backlog and wants the list to only
 *  show new failures going forward. */
export async function clearErrorsAction(): Promise<{ error?: string }> {
  const admin = await requireAdmin();

  try {
    await clearErrorLog();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao limpar erros" };
  }

  await logAdminAction(admin.id, "clear_errors", null, "Erros limpos manualmente");
  revalidatePath("/admin/errors");
  return {};
}
