import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  { href: "/teams", label: "Teams" },
  { href: "/results", label: "Results" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
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
