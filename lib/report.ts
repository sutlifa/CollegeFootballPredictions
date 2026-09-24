/**
 * The problem reporter's field rules, shared by the form
 * (app/report/ReportForm.tsx) and the server action that sends it
 * (app/report/actions.ts).
 *
 * They live here rather than in either of those because the action file is
 * "use server", which may only export async functions -- a constant exported
 * from it fails the build -- and because the client limits and the server
 * checks must be the SAME numbers. The browser's maxLength is a courtesy; a
 * hand-rolled POST skips it entirely, so the server enforces every one of
 * these again.
 */

/**
 * What the "What is this?" select offers. The chosen value goes straight
 * into the email subject, so the server accepts only these exact strings;
 * anything else is refused rather than mailed, since a free-text subject
 * from a tampered post is a header someone else wrote.
 */
export const REPORT_KINDS = [
  "Something is broken",
  "Something looks wrong",
  "A suggestion",
  "A question",
  "Delete my account and data",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(value: string): value is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(value);
}

/** "Where did it happen?" is a pointer ("Week 4, on my phone"), not a second body. */
export const REPORT_WHERE_MAX = 200;
/** Below this the report is almost certainly not actionable. */
export const REPORT_BODY_MIN = 10;
export const REPORT_BODY_MAX = 5000;
