"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { registerSchema, signInSchema, changePasswordSchema } from "@/lib/validation/auth";
import { normalizePhone } from "@/lib/phone";
import { getRequestFingerprint } from "@/lib/requestInfo";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/rateLimit";

type ActionResult = { error?: string };

/**
 * Supabase's native Phone auth provider requires an SMS provider (Twilio/
 * MessageBird/Vonage) configured in the project dashboard before it can even
 * be turned on — real cost and setup we don't need for password-based login.
 * Instead we keep the already-working Email provider and derive a synthetic,
 * never-shown, never-emailed address deterministically from the phone
 * number. The user only ever sees/enters their phone number; this is purely
 * an internal identity key for Supabase Auth.
 */
function phoneToSyntheticEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `p${digits}@duelo.mz`;
}

/**
 * registerUser — create Supabase Auth user (via synthetic email identity,
 * see phoneToSyntheticEmail) + profiles row. ageConfirmed is enforced
 * server-side — this is the primary trust boundary.
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
  const syntheticEmail = phoneToSyntheticEmail(phone);

  // 2. Enforce 18+ server-side — belt AND suspenders (client also disables the button)
  if (!ageConfirmed) {
    return { error: "Deves confirmar que tens 18 anos ou mais" };
  }

  // 3. Create Supabase Auth user (owns credential hashing — never hand-rolled).
  //    Uses the synthetic email as the identity (see phoneToSyntheticEmail) —
  //    email_confirm skips confirmation since no email is ever actually sent.
  const supabase = await createServiceClient();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
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
    email: syntheticEmail,
    password,
  });

  if (signInError) {
    // Profile created — user can log in manually
    redirect("/login");
  }

  // Land on the feed — that's the heart of the app (open duels to browse and
  // accept). The wallet is one tap away in the nav; forcing a new user to the
  // wallet first read as "where are the bets?".
  redirect("/");
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
  const { ip } = await getRequestFingerprint();

  // Fail OPEN: this check is an extra layer against brute-forcing, not the
  // actual credential check (that's supabase.auth.signInWithPassword below,
  // which never gets skipped). If the DB hiccups here, a real user with the
  // right password should still be able to log in — the alternative is
  // every login on the app going down whenever this one query has trouble.
  try {
    const rateLimit = await checkLoginRateLimit(phone, ip);
    if (!rateLimit.allowed) {
      return { error: rateLimit.message };
    }
  } catch (err) {
    console.error("checkLoginRateLimit failed, allowing attempt through:", err);
  }

  const syntheticEmail = phoneToSyntheticEmail(phone);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password: parsed.data.password });

  // Best-effort only — the login itself already succeeded or failed above;
  // failing to record the attempt shouldn't turn a successful login into an
  // error page.
  try {
    await recordLoginAttempt(phone, ip, !error);
  } catch (err) {
    console.error("recordLoginAttempt failed:", err);
  }

  if (error) {
    return {
      error: "Número ou password incorretos. Verifica os dados e tenta novamente.",
    };
  }

  redirect("/");
}

/**
 * signOut — invalidates the session and redirects to the landing page.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * changePasswordAction — self-service password change from /perfil. No
 * current-password confirmation required: the user already has an active,
 * cookie-verified Supabase session at this point (same trust level the
 * "esqueci a password" admin-assisted reset relies on), and
 * supabase.auth.updateUser() only ever acts on that session's own account.
 */
export async function changePasswordAction(input: Record<string, unknown>): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "Não foi possível alterar a password. Tenta novamente." };
  }

  return {};
}
