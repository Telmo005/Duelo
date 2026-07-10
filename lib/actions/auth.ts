"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { registerSchema, signInSchema } from "@/lib/validation/auth";

type ActionResult = { error?: string };

/** Supabase's phone identity wants a clean E.164 string — our form/regex
 *  allows optional spaces for readability ("+258 84 XXX XXXX"), so strip
 *  them before this ever reaches Supabase or gets stored. */
function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}

/**
 * registerUser — create Supabase Auth user (phone identity) + profiles row.
 * ageConfirmed is enforced server-side — this is the primary trust boundary.
 */
export async function registerUser(
  input: Record<string, unknown>
): Promise<ActionResult> {
  // 1. Validate input (server-side — never trust client)
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message;
    return { error: firstError ?? "Dados inválidos" };
  }

  const { displayName, password, ageConfirmed } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);

  // 2. Enforce 18+ server-side — belt AND suspenders (client also disables the button)
  if (!ageConfirmed) {
    return { error: "Deves confirmar que tens 18 anos ou mais" };
  }

  // 3. Create Supabase Auth user with a phone identity (owns credential
  //    hashing — never hand-rolled). No SMS/OTP involved: phone_confirm
  //    marks it confirmed immediately, same trade-off email_confirm made
  //    for the previous email-based flow.
  const supabase = await createServiceClient();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });

  if (authError) {
    // Normalise Supabase errors into user-friendly messages (no stack leak)
    if (authError.message.toLowerCase().includes("already")) {
      return { error: "Este número já está registado. Tenta entrar." };
    }
    return { error: "Não foi possível criar a conta. Tenta novamente." };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: "Erro inesperado. Tenta novamente." };
  }

  // 4. Insert profiles row (service-role bypasses RLS — required for inserts)
  try {
    await db.insert(profiles).values({
      id: userId,
      phone,
      displayName,
      ageConfirmedAt: new Date(),
    });
  } catch (err: unknown) {
    // Check for unique constraint violation (phone already used)
    const message = err instanceof Error ? err.message : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      // Clean up auth user to avoid orphaned account
      await supabase.auth.admin.deleteUser(userId);
      return { error: "Este número já está registado. Tenta entrar." };
    }
    // Clean up auth user on any insert failure
    await supabase.auth.admin.deleteUser(userId);
    return { error: "Erro ao guardar o perfil. Tenta novamente." };
  }

  // 5. Create the zero-balance wallet row (idempotent — safe to retry)
  const { error: walletError } = await supabase.rpc("wallet_ensure", { p_user_id: userId });
  if (walletError) {
    await supabase.auth.admin.deleteUser(userId);
    return { error: "Erro ao criar a carteira. Tenta novamente." };
  }

  // 6. Sign user in immediately after registration
  const anonClient = await createClient();
  const { error: signInError } = await anonClient.auth.signInWithPassword({
    phone,
    password,
  });

  if (signInError) {
    // Profile created — user can log in manually
    redirect("/login");
  }

  redirect("/dashboard");
}

/** signIn — phone + password (the app's sole login identity for now). */
export async function signIn(
  input: Record<string, unknown>
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const phone = normalizePhone(parsed.data.phone);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ phone, password: parsed.data.password });

  if (error) {
    return {
      error: "Número ou password incorretos. Verifica os dados e tenta novamente.",
    };
  }

  redirect("/dashboard");
}

/**
 * signOut — invalidates the session and redirects to the landing page.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
