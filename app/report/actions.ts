"use server";

import { auth } from "@/auth";
import { sendReport } from "@/lib/email";
import {
  isReportKind,
  REPORT_BODY_MAX,
  REPORT_BODY_MIN,
  REPORT_WHERE_MAX,
} from "@/lib/report";

export type ReportState = { status: "idle" | "sent" | "error"; message?: string };

/**
 * Emails a problem report to whoever runs the app.
 *
 * Signed-in only (the whole app is), so the reporter's identity comes from
 * the session rather than a field someone can type anything into -- that is
 * both less to fill in and impossible to spoof.
 *
 * Every `message` returned here is read by the reporter, so none of them
 * may carry an env var name or a provider's response body. The detail goes
 * to the server log under an UPPERCASE label instead; it used to be pasted
 * into the message ("Couldn't send that: 401 {...}"), which told a user
 * nothing they could act on and told anyone curious how the app is wired.
 */
export async function sendReportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "You need to be signed in to send a report." };
  }

  const kind = String(formData.get("kind") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const where = String(formData.get("where") ?? "").trim();

  // The select only offers REPORT_KINDS, so anything else came from a
  // hand-built post -- and it is headed for the email subject line.
  if (!isReportKind(kind)) {
    return { status: "error", message: "Please choose what kind of report this is." };
  }
  if (body.length < REPORT_BODY_MIN) {
    return { status: "error", message: "Please describe what happened in a bit more detail." };
  }
  if (body.length > REPORT_BODY_MAX) {
    return { status: "error", message: "That is longer than the form accepts -- please trim it a little." };
  }
  if (where.length > REPORT_WHERE_MAX) {
    return {
      status: "error",
      message: `Please keep "Where did it happen?" under ${REPORT_WHERE_MAX} characters -- the details belong in the description.`,
    };
  }

  const name = session.user.name ?? session.user.email;
  try {
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
      console.error("SEND REPORT ERROR:", outcome.error);
      return {
        status: "error",
        message: "Couldn't send your report right now -- please try again later.",
      };
    }
    return { status: "sent" };
  } catch (err) {
    // sendReport catches its own fetch failures, so this is belt and
    // braces -- but an exception thrown out of an action replaces the page
    // with the error screen, which would take the typed report with it.
    console.error("SEND REPORT ERROR:", err);
    return {
      status: "error",
      message: "Couldn't send your report right now -- please try again later.",
    };
  }
}
