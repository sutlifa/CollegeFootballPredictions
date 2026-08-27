import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { MobileNav } from "@/components/MobileNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "College Football Predictions",
  description: "Predict every FBS game of the season and see how it plays out.",
};

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/standings", label: "Standings" },
  { href: "/rankings", label: "Rankings" },
  { href: "/bracket", label: "Bracket" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-field text-ink">
        {/* `relative` anchors the mobile menu panel, which drops out of the
            header with `absolute inset-x-0 top-full`. */}
        <header className="relative border-b-2 border-accent/70 bg-surface shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
          <nav className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-base font-bold tracking-wide text-accent-strong">
              <span aria-hidden>🏈</span> CFB Predictions
            </span>

            {/* Inline nav is `sm` and up only -- below that these links and
                the sign-out button live in the folding menu instead of
                wrapping onto three cramped lines. */}
            {session?.user && (
              <div className="hidden gap-1 sm:flex sm:flex-wrap">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded px-2.5 py-1.5 font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-accent-strong"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
            {session?.user && (
              <div className="ml-auto hidden items-center gap-3 sm:flex">
                <span className="text-ink-muted">
                  {session.user.name ?? session.user.email}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded border border-line-strong px-2.5 py-1 text-xs text-ink-soft hover:border-accent hover:text-accent-strong"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}

            {session?.user && (
              <div className="ml-auto sm:hidden">
                <MobileNav
                  links={NAV_LINKS}
                  userLabel={session.user.name ?? session.user.email ?? ""}
                  signOutAction={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                />
              </div>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        {/* No top border -- the footer sits flush against the page. */}
        <footer className="mx-auto w-full max-w-5xl space-y-1 px-4 py-4 text-center text-xs text-ink-muted">
          <p>2026 Season</p>
          <p>&copy; {new Date().getFullYear()} Sutlifa. All rights reserved.</p>
          <p className="text-[11px] leading-relaxed">
            Not affiliated with or endorsed by the NCAA, the College Football
            Playoff, or any school or conference. Team names and logos are
            trademarks of their respective owners.
          </p>
        </footer>
      </body>
    </html>
  );
}
