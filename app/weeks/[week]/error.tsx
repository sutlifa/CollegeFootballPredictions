"use client";

export default function WeekError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-loss/50 bg-loss/10 p-4">
      <p className="font-semibold text-loss">Couldn&apos;t save that prediction</p>
      <p className="text-sm text-ink-soft">{error.message}</p>
      <button
        onClick={() => retry()}
        className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
      >
        Back to the week
      </button>
    </div>
  );
}
