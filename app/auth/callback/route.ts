import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/errorLog";
import { generateReferralCode } from "@/lib/referral";

function isReferralCodeCollision(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint_name?: string } | undefined;
  return pgErr?.code === "23505" && pgErr?.constraint_name === "profiles_referral_code_uq";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;

      // Create profile if first login (Google OAuth users won't have one yet)
      const existing = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);

      if (existing.length === 0) {
        const displayName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Jogador";

        // Same referral_code retry-on-collision as registerUser
        // (lib/actions/auth.ts) — this OAuth path shares the same
        // profiles.referral_code NOT NULL/unique constraint, so it needs
        // its own code generated too, just with no referrer to resolve
        // (Google sign-in carries no ?ref= today).
        const MAX_CODE_ATTEMPTS = 5;
        let lastErr: unknown;
        let created = false;
        for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS && !created; attempt++) {
          try {
            await db.insert(profiles).values({
              id: user.id,
              email: user.email ?? "",
              displayName,
              phone: null,
              ageConfirmedAt: new Date(),
              referralCode: generateReferralCode(),
            }).onConflictDoNothing();
            created = true;
          } catch (err) {
            lastErr = err;
            if (!isReferralCodeCollision(err)) break;
          }
        }
        if (!created) {
          console.error("auth/callback: failed to create profile for", user.id, lastErr);
          await logError("auth_callback", lastErr, { userId: user.id });
          return NextResponse.redirect(new URL("/login?error=profile", request.url));
        }
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
