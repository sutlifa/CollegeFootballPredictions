import { NextResponse } from "next/server";
import { auth } from "@/auth";

// `middleware.ts` is deprecated in this Next.js version -- renamed to
// `proxy.ts` (Proxy defaults to the Node.js runtime here, confirmed against
// the installed Next.js docs, not assumed from older training data).
export default auth((req) => {
  const isSignedIn = !!req.auth;
  const isSignInPage = req.nextUrl.pathname === "/signin";
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  // Cron and admin routes authenticate machine callers via their own
  // secret header/token (CRON_SECRET / ADMIN_SECRET) -- they have no
  // browser session to check, so the session gate must not run for them at
  // all, or every call gets redirected to /signin before that check runs.
  // About and Privacy are readable without signing in. A privacy policy you
  // must hand over an account to read is not much of a disclosure, and
  // Google's OAuth consent screen wants a reachable link to it.
  const isPublicPage =
    req.nextUrl.pathname === "/about" || req.nextUrl.pathname === "/privacy";
  const isServiceRoute =
    req.nextUrl.pathname.startsWith("/api/cron/") ||
    req.nextUrl.pathname.startsWith("/api/admin/");

  if (
    !isSignedIn &&
    !isSignInPage &&
    !isAuthRoute &&
    !isServiceRoute &&
    !isPublicPage
  ) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isSignedIn && isSignInPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
