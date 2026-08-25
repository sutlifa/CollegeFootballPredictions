import { NextResponse } from "next/server";
import { auth } from "@/auth";

// `middleware.ts` is deprecated in this Next.js version -- renamed to
// `proxy.ts` (Proxy defaults to the Node.js runtime here, confirmed against
// the installed Next.js docs, not assumed from older training data).
export default auth((req) => {
  const isSignedIn = !!req.auth;
  const isSignInPage = req.nextUrl.pathname === "/signin";
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

  if (!isSignedIn && !isSignInPage && !isAuthRoute) {
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
