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
  // The unsubscribe link in every reminder email authenticates by the token
  // in its own query string, exactly like the cron/admin routes authenticate
  // by their secret -- there is no session to check, and demanding one broke
  // it twice over: the reader was bounced to /signin, and the callbackUrl
  // kept only the pathname, so the token was gone by the time they came back
  // and even a signed-in retry landed on "Something's missing". Someone who
  // wants the emails to stop must not have to log in to say so (the route's
  // own comment and /privacy both promise this). Exact match, not a prefix,
  // so nothing added under it later is silently public.
  const isServiceRoute =
    req.nextUrl.pathname.startsWith("/api/cron/") ||
    req.nextUrl.pathname.startsWith("/api/admin/") ||
    req.nextUrl.pathname === "/api/unsubscribe";

  if (
    !isSignedIn &&
    !isSignInPage &&
    !isAuthRoute &&
    !isServiceRoute &&
    !isPublicPage
  ) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    // Pathname AND search: a shared /compare?week=3&who=1&who=27 link is the
    // whole point of that page, and signing in used to drop everything after
    // the "?", landing the reader on a blank comparison. Both parts come from
    // the parsed request URL, never the raw Host or a header, so the value is
    // always a same-origin path. It still passes through app/signin/page.tsx's
    // "//" and "/\" rejection before anything redirects to it -- that check,
    // not this line, is the open-redirect guard, and it must stay.
    signInUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search,
    );
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
