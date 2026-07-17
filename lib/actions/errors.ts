"use server";

import { logError } from "@/lib/errorLog";

/** Lets the client-side error boundary (app/error.tsx) persist a render
 *  error the same way every server-side failure already does — otherwise a
 *  crash in the browser only ever reached that one person's console, with
 *  no trace for anyone to notice or investigate later. */
export async function logClientError(message: string, clientStack: string | null, url?: string): Promise<void> {
  await logError("client_error_boundary", message, { clientStack, url });
}
