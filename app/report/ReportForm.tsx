"use client";

import { useActionState } from "react";
import { sendReportAction, type ReportState } from "./actions";

/**
 * The reporter. Deliberately three fields and no account details: who sent
 * it comes from the session, so there is nothing to fill in that the app
 * already knows and nothing anyone can put a false name into.
 */
export function ReportForm() {
  const [state, action, pending] = useActionState<ReportState, FormData>(
    sendReportAction,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <p className="rounded-lg border border-win/50 bg-win/10 px-3 py-3 text-sm text-ink">
        <span className="font-semibold">Sent — thank you.</span> It went
        straight to the person who runs the app, with your email as the
        reply-to, so you may hear back directly.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="kind" className="block text-sm font-medium text-ink">
          What is this?
        </label>
        <select
          id="kind"
          name="kind"
          className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
        >
          <option>Something is broken</option>
          <option>Something looks wrong</option>
          <option>A suggestion</option>
          <option>A question</option>
          <option>Delete my account and data</option>
        </select>
      </div>

      <div>
        <label htmlFor="where" className="block text-sm font-medium text-ink">
          Where did it happen?{" "}
          <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id="where"
          name="where"
          type="text"
          placeholder="e.g. Week 4, on my phone"
          className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
        />
      </div>

      <div>
        <label htmlFor="body" className="block text-sm font-medium text-ink">
          What happened?
        </label>
        <textarea
          id="body"
          name="body"
          rows={6}
          required
          minLength={10}
          maxLength={5000}
          placeholder="What you did, what you expected, and what happened instead."
          className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
        />
      </div>

      {state.status === "error" && state.message && (
        <p className="rounded border border-loss/50 bg-loss/10 px-3 py-2 text-sm text-loss">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
