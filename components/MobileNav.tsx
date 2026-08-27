"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavLink = { href: string; label: string };

type Props = {
  links: NavLink[];
  userLabel: string;
  /** Server action, passed down from the layout -- sign-out has to run on the server. */
  signOutAction: () => Promise<void>;
};

/**
 * The small-screen nav: a hamburger that folds the page links and the
 * sign-out button away until tapped. Hidden from `sm` up, where the layout
 * shows the normal inline nav instead.
 *
 * This has to be a client component rather than a CSS-only <details>
 * toggle: Next's <Link> navigates on the client, so a details-based menu
 * would stay open on top of whatever page you just moved to. Watching the
 * pathname lets it close itself on navigation.
 */
export function MobileNav({ links, userLabel, signOutAction }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-soft hover:border-accent hover:text-accent-strong"
      >
        <span aria-hidden className="text-lg leading-none">
          {open ? "✕" : "☰"}
        </span>
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-full z-30 border-b border-line bg-surface shadow-[0_8px_20px_rgba(0,0,0,0.45)]"
        >
          <div className="flex flex-col gap-1 px-4 py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-2.5 font-medium ${
                  pathname === link.href
                    ? "bg-surface-2 text-accent-strong"
                    : "text-ink-soft hover:bg-surface-2 hover:text-accent-strong"
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="min-w-0 truncate text-xs text-ink-muted">
                {userLabel}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded border border-line-strong px-3 py-2 text-xs text-ink-soft hover:border-accent hover:text-accent-strong"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
