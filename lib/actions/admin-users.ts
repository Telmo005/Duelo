"use server";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { logAdminAction } from "@/lib/adminAudit";

type FindUserResult = {
  error?: string;
  user?: { id: string; displayName: string; phone: string; createdAt: string };
};

/**
 * Support-assisted account recovery (ADMIN password reset). With no SMS/
 * email channel to the user, self-service reset isn't available yet — an
 * admin verifies the caller's identity by phone (name, account details)
 * and sets a new password directly. Gated by requireAdmin.
 */
export async function findUserByPhoneAction(phoneInput: string): Promise<FindUserResult> {
  await requireAdmin();

  const phone = normalizePhone(phoneInput);
  if (!phone) return { error: "Indica um número de telemóvel." };

  const [profile] = await db.select().from(profiles).where(eq(profiles.phone, phone)).limit(1);
  if (!profile) return { error: "Nenhuma conta encontrada com esse número." };

  return {
    user: {
      id: profile.id,
      displayName: profile.displayName,
      phone: profile.phone ?? phone,
      createdAt: profile.createdAt.toISOString(),
    },
  };
}

type ResetResult = { error?: string; success?: boolean };

export async function adminResetPasswordAction(userId: string, newPassword: string): Promise<ResetResult> {
  const admin = await requireAdmin();

  if (newPassword.length < 8 || newPassword.length > 72) {
    return { error: "A password deve ter entre 8 e 72 caracteres." };
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { error: "Não foi possível repor a password. Tenta novamente." };

  await logAdminAction(admin.id, "password_reset", userId, "Password reposta via /admin/users");

  return { success: true };
}
