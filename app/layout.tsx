import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
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
  { href: "/results", label: "Results" },
];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-field text-ink">
        <header className="border-b-2 border-accent/70 bg-surface shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-5 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-base font-bold tracking-wide text-accent-strong">
              <span aria-hidden>🏈</span> CFB Predictions
            </span>
            {session?.user && (
              <div className="flex flex-wrap gap-1">
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
              <div className="ml-auto flex items-center gap-3">
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
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-3 text-center text-xs text-ink-muted">
          2026 Season
        </footer>
      </body>
    </html>
  );
}
