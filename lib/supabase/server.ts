import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — middleware handles refresh
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS and calls service_role-only RPC
 * functions (wallet_*, bet_*).
 *
 * Deliberately built with the plain @supabase/supabase-js client, NOT
 * createServerClient from @supabase/ssr. createServerClient is a
 * cookie-syncing client designed to act AS the signed-in user — if a
 * session cookie is present it attaches the user's own access token to
 * every request, silently downgrading calls to the `authenticated`
 * Postgres role regardless of which key you pass in. That defeats the
 * whole point of a service-role client (whose calls must run as
 * `service_role`, independent of whatever user happens to be logged
 * in) and surfaces as a confusing "permission denied" from functions
 * that are intentionally revoked from `authenticated`.
 * NEVER expose this to the client; use only in server actions and route handlers.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Fail loudly here rather than handing supabase-js an "undefined" key —
  // that would just surface later as a confusing auth/network error from
  // deep inside whichever RPC call happened to run first.
  if (!url || !serviceRoleKey) {
    throw new Error("createServiceClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set");
  }

  return createSupabaseJsClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
