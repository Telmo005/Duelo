import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/errorLog";

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

        try {
          await db.insert(profiles).values({
            id: user.id,
            email: user.email ?? "",
            displayName,
            phone: null,
            ageConfirmedAt: new Date(),
          }).onConflictDoNothing();
        } catch (err) {
          console.error("auth/callback: failed to create profile for", user.id, err);
          await logError("auth_callback", err, { userId: user.id });
          return NextResponse.redirect(new URL("/login?error=profile", request.url));
        }
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
