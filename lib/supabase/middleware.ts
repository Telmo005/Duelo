import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — do not remove this call. Wrapped in try/catch because
  // this runs in Edge Middleware on EVERY request (see proxy.ts's broad
  // matcher): an unhandled rejection here (Supabase having a brief hiccup, a
  // slow/flaky mobile connection to the Edge network, a transient DNS blip)
  // used to crash the whole request before any page ever rendered — the
  // user got the browser's bare "This page couldn't load" screen instead of
  // the app, on what could be any route. Failing open to "anonymous" for
  // this one request is safe: it only means a logged-in user briefly gets
  // treated as logged-out (redirected to /login on a protected route, or
  // shown the logged-out feed) rather than the entire site going down.
  let user = null;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (err) {
    console.error("updateSession: supabase.auth.getUser() failed, treating request as anonymous", err);
  }

  return { supabaseResponse, user };
}
