"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import {
  REPORT_BODY_MAX,
  REPORT_BODY_MIN,
  REPORT_KINDS,
  REPORT_WHERE_MAX,
} from "@/lib/report";
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

  // The form carries the action AND an onSubmit, and each covers a
  // different moment:
  //
  // - Before hydration there is no onSubmit, so the browser submits the
  //   form natively -- and React server-renders an `action` given a server
  //   action as a real POST to it. Without an action the native fallback
  //   was a GET to /report with the whole report in the query string, which
  //   put it in the URL, the history and the server log, and sent nothing.
  //
  // - Once hydrated, onSubmit calls preventDefault and dispatches the action
  //   itself inside a transition. That matters because React 19 resets a
  //   form's uncontrolled fields after an `action` it ran completes --
  //   whatever the action returned -- so a report that failed to send came
  //   back as an error above an empty form (see PROJECT.md "Landmines" for
  //   the same reset biting GamePicker). React checks for a prevented
  //   default before running the form action, and in that case runs no
  //   action and requests no reset (verified in react-dom's submit handler,
  //   not assumed), so on failure every field keeps exactly what was typed.
  //   On success the thank-you replaces the form, so nothing needs clearing.
  //   `pending` still tracks the dispatch because it runs in a transition.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

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
    <form action={action} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="kind" className="block text-sm font-medium text-ink">
          What is this?
        </label>
        <select
          id="kind"
          name="kind"
          className="mt-1 w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
        >
          {/* The server accepts only these exact strings (lib/report.ts). */}
          {REPORT_KINDS.map((kind) => (
            <option key={kind}>{kind}</option>
          ))}
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
          maxLength={REPORT_WHERE_MAX}
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
          minLength={REPORT_BODY_MIN}
          maxLength={REPORT_BODY_MAX}
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
