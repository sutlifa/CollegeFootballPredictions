"use server";

import { auth } from "@/auth";
import { sendReport } from "@/lib/email";

export type ReportState = { status: "idle" | "sent" | "error"; message?: string };

/**
 * Emails a problem report to whoever runs the app.
 *
 * Signed-in only (the whole app is), so the reporter's identity comes from
 * the session rather than a field someone can type anything into -- that is
 * both less to fill in and impossible to spoof.
 */
export async function sendReportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "You need to be signed in to send a report." };
  }

  const kind = String(formData.get("kind") ?? "Problem");
  const body = String(formData.get("body") ?? "").trim();
  const where = String(formData.get("where") ?? "").trim();

  if (body.length < 10) {
    return { status: "error", message: "Please describe what happened in a bit more detail." };
  }
  if (body.length > 5000) {
    return { status: "error", message: "That is longer than the form accepts -- please trim it a little." };
  }

  const name = session.user.name ?? session.user.email;
  const outcome = await sendReport({
    fromName: name,
    fromEmail: session.user.email,
    subject: `[CFB Predictions] ${kind}`,
    body: [where ? `Where: ${where}` : null, "", body].filter((l) => l !== null).join("\n"),
  });

  if (outcome.dryRun) {
    return {
      status: "error",
      message:
        "Email sending isn't switched on for this deployment, so the report couldn't be delivered. Please pass it on directly.",
    };
  }
  if (!outcome.ok) {
    return { status: "error", message: `Couldn't send that: ${outcome.error ?? "unknown error"}` };
  }
  return { status: "sent" };
}
