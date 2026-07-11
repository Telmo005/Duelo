import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/wallet", "/bet", "/perfil", "/admin"];

const DEVICE_ID_COOKIE = "device_id";

// Routes that should redirect authenticated users to the feed
const AUTH_ROUTES = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // Redirect unauthenticated users away from protected routes
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages — to the feed, the
  // heart of the app (matches the post-login/register landing in
  // lib/actions/auth.ts). Sending them to /dashboard instead read as
  // "where are the bets?".
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Long-lived device fingerprint — a lightweight signal (paired with IP)
  // for the same-device/IP self-betting heuristic (ADMIN-02). Not meant to
  // survive a cleared cookie jar or incognito window; that's an accepted
  // MVP limitation, not a security boundary.
  if (!request.cookies.get(DEVICE_ID_COOKIE)) {
    supabaseResponse.cookies.set(DEVICE_ID_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files and
     * Next.js internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
