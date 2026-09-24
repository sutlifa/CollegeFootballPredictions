"use client";

import Link from "next/link";

/**
 * The fallback when /bracket fails, in the same shape as the week page's
 * (app/weeks/[week]/error.tsx).
 *
 * Without this file a throw from any bracket action -- "Submit Round 1
 * Picks", "Yes, re-pick", choosing the field -- fell through to Next's
 * bare crash screen. The actions still throw rather than return: they are
 * plain `<form action>` submissions, where a returned value has nowhere to
 * go, and every refusal they make (an invalid round, a missing pick, fewer
 * than 12 teams) is something the UI already prevents, so reaching one
 * means a stale page, a tampered post or a lapsed session. That last one is
 * the realistic case, hence the sign-in link.
 *
 * `error.message` is deliberately not shown: production replaces it with a
 * generic string and a digest. The digest is shown so a report can be
 * matched to the server log.
 */
export default function BracketError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-loss/50 bg-loss/10 p-4">
      <p className="font-semibold text-loss">Something went wrong with your bracket</p>
      <p className="text-sm text-ink-soft">
        Rounds you had already submitted are safe. Try again, and if it keeps
        happening you may have been signed out --{" "}
        <Link
          href="/signin?callbackUrl=%2Fbracket"
          className="text-accent-strong hover:underline"
        >
          sign in again
        </Link>
        .
      </p>
      {error.digest && (
        <p className="text-xs text-ink-muted">Reference: {error.digest}</p>
      )}
      <button
        onClick={() => retry()}
        className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
      >
        Try again
      </button>
    </div>
  );
}
