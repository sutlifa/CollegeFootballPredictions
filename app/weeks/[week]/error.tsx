"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The fallback when this week's page fails -- a render or data fault, or a
 * write that could not even be answered.
 *
 * It does NOT show `error.message`. In production Next replaces a Server
 * Component's error message with a generic one plus a digest, so that text
 * was never the real reason anyway; the reasons a person can act on (week
 * locked, signed out) are now returned by the actions and shown next to the
 * control that failed. It also no longer says "Couldn't save that
 * prediction": most of what lands here is a page that failed to load, and
 * telling someone a save failed when they had not saved anything sends
 * them looking for the wrong problem.
 *
 * The digest is shown because it is the one thing that matches this
 * failure to its line in the server log.
 */
export default function WeekError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-3 rounded-lg border border-loss/50 bg-loss/10 p-4">
      <p className="font-semibold text-loss">Something went wrong with this week</p>
      <p className="text-sm text-ink-soft">
        Picks that already show as saved are safe. Try again, and if it keeps
        happening you may have been signed out --{" "}
        <Link
          href={`/signin?callbackUrl=${encodeURIComponent(pathname)}`}
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
