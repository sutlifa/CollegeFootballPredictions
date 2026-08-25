"use client";

export default function WeekError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-red-900 bg-red-950/40 p-4">
      <p className="font-medium text-red-300">Couldn&apos;t save that prediction</p>
      <p className="text-sm text-neutral-300">{error.message}</p>
      <button
        onClick={() => retry()}
        className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
      >
        Back to the week
      </button>
    </div>
  );
}
