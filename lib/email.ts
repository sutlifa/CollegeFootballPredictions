import { getWeekLabel } from "./format";
import type { ReminderDecision } from "./reminders";

/**
 * Sending mail. One POST, no SDK, and deliberately not tied to one vendor.
 *
 * TWO PROVIDERS, BECAUSE THEY DIFFER ON THE ONE THING THAT MATTERS HERE:
 * who you are allowed to email.
 *
 *  - Resend will only deliver to the account owner's own address until you
 *    verify a DOMAIN you control. Fine if you own one; a hard stop if you
 *    don't, and not worth buying a domain over for a pool of ten people.
 *  - Brevo verifies a single SENDER ADDRESS instead -- click a link in a
 *    confirmation mail sent to, say, your Gmail, and you can then mail
 *    anyone. Free tier is 300/day, against the ~20 a week this needs.
 *
 * Whichever key is present wins, Brevo first. Everything above this layer
 * is unchanged: the same decision logic, ledger and templates feed both.
 *
 * SENDING IS OFF UNLESS TWO SEPARATE THINGS ARE TRUE: some provider key is
 * present AND EMAIL_REMINDERS_ENABLED is exactly "true". Two switches on
 * purpose. A key alone is the sort of thing that gets pasted into an
 * environment to "see if it works" and would otherwise immediately mail
 * every real person in the database. With either missing, everything below
 * runs normally and reports exactly who WOULD have been mailed, which is
 * also how you test it.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type EmailProvider = "brevo" | "resend" | null;

export function activeProvider(): EmailProvider {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

/** "CFB Predictions <picks@example.com>" -> its two halves. */
export function parseFrom(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || "CFB Predictions", email: match[2] };
  return { name: "CFB Predictions", email: value.trim() };
}

export type SendOutcome = {
  email: string;
  ok: boolean;
  /** True when nothing was actually sent because sending is disabled. */
  dryRun: boolean;
  error?: string;
};

export function emailEnabled(): boolean {
  return (
    activeProvider() !== null &&
    process.env.EMAIL_REMINDERS_ENABLED === "true"
  );
}

/** Where links in the mail point. Falls back to the Vercel-provided URL. */
export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

function firstName(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

function hoursUntil(at: Date, now: Date): number {
  return Math.max(0, Math.round((at.getTime() - now.getTime()) / 3_600_000));
}

export function renderReminder(
  decision: ReminderDecision,
  now: Date,
): { subject: string; text: string; html: string } {
  const label = getWeekLabel(decision.week);
  const hours = hoursUntil(decision.locksAt, now);
  const when =
    decision.kind === "last_call"
      ? `in about ${hours} hour${hours === 1 ? "" : "s"}`
      : decision.locksAt.toLocaleString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
          timeZoneName: "short",
        });

  // Subjects read like a note from a person, not a campaign. "Picks are
  // open -- 91 left" is a promotion; "your picks aren't in yet" is a
  // reminder, and Gmail sorts on exactly that kind of difference.
  const subject =
    decision.kind === "last_call"
      ? `${label} picks lock ${when}`
      : `Your ${label} picks aren't in yet`;

  const url = `${appUrl()}/weeks/${decision.week}`;
  const unsub = decision.unsubscribeToken
    ? `${appUrl()}/api/unsubscribe?token=${encodeURIComponent(decision.unsubscribeToken)}`
    : null;

  const madeLine =
    decision.picksMade === 0
      ? `You haven't picked any of the ${decision.totalGames} games yet.`
      : `You've picked ${decision.picksMade} of ${decision.totalGames} — ${decision.missing} to go.`;

  const text = [
    `Hi ${firstName(decision.name)},`,
    ``,
    `${label} locks ${when}, and picks freeze once the first game kicks off.`,
    madeLine,
    ``,
    `Make your picks: ${url}`,
    ...(unsub ? [``, `Stop these reminders: ${unsub}`] : []),
  ].join("\n");

  // Deliberately plain. The previous version had a big green
  // display:inline-block CTA button, a custom font stack and a styled
  // footer -- the exact shape of a marketing template, and it landed in
  // Gmail's Promotions tab. A reminder nobody sees is a reminder that
  // failed, so this is now an ordinary link in an ordinary sentence, with
  // no colours, no button and no font overrides. It should look like
  // something a person typed.
  const html = [
    `<p>Hi ${escapeHtml(firstName(decision.name))},</p>`,
    `<p>${escapeHtml(label)} locks ${escapeHtml(when)}, and picks freeze once the first game kicks off. ${escapeHtml(madeLine)}</p>`,
    `<p><a href="${url}">Make your picks</a></p>`,
    ...(unsub
      ? [`<p>To stop these reminders, <a href="${unsub}">use this link</a>.</p>`]
      : []),
  ].join("");

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendReminder(
  decision: ReminderDecision,
  now: Date,
): Promise<SendOutcome> {
  const { subject, text, html } = renderReminder(decision, now);

  if (!emailEnabled()) {
    return { email: decision.email, ok: true, dryRun: true };
  }

  const provider = activeProvider();
  const from = parseFrom(
    process.env.EMAIL_FROM ?? "CFB Predictions <onboarding@resend.dev>",
  );

  try {
    const response =
      provider === "brevo"
        ? await fetch(BREVO_ENDPOINT, {
            method: "POST",
            headers: {
              "api-key": process.env.BREVO_API_KEY!,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              sender: from,
              // A working reply-to reads as correspondence rather than a
              // broadcast, and means a confused reply reaches a human.
              replyTo: from,
              to: [{ email: decision.email, name: decision.name ?? undefined }],
              subject,
              textContent: text,
              htmlContent: html,
            }),
          })
        : await fetch(RESEND_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${from.name} <${from.email}>`,
              reply_to: from.email,
              to: [decision.email],
              subject,
              text,
              html,
            }),
          });
    if (!response.ok) {
      const body = await response.text();
      return {
        email: decision.email,
        ok: false,
        dryRun: false,
        error: `${response.status} ${body.slice(0, 200)}`,
      };
    }
    return { email: decision.email, ok: true, dryRun: false };
  } catch (error) {
    return {
      email: decision.email,
      ok: false,
      dryRun: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Send one plain message to the person who runs the app. Used by the
 * problem reporter, which is the only path here that a user triggers
 * directly, so it says who sent it and sets reply-to to them rather than to
 * the app -- a bug report you cannot reply to is half a bug report.
 *
 * Falls back to the from-address when REPORT_TO is unset, on the assumption
 * that whoever configured sending is the person who wants the reports.
 */
export async function sendReport(options: {
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}): Promise<SendOutcome> {
  const to =
    process.env.REPORT_TO ??
    parseFrom(process.env.EMAIL_FROM ?? "").email ??
    "";
  if (!to) {
    return { email: "", ok: false, dryRun: false, error: "No REPORT_TO or EMAIL_FROM configured" };
  }
  if (!emailEnabled()) {
    return { email: to, ok: true, dryRun: true };
  }

  const provider = activeProvider();
  const from = parseFrom(process.env.EMAIL_FROM ?? "");
  const text = [
    options.body,
    "",
    "---",
    `Sent by ${options.fromName} <${options.fromEmail}> via the in-app reporter.`,
  ].join("\n");

  try {
    const response =
      provider === "brevo"
        ? await fetch(BREVO_ENDPOINT, {
            method: "POST",
            headers: {
              "api-key": process.env.BREVO_API_KEY!,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              sender: from,
              replyTo: { email: options.fromEmail, name: options.fromName },
              to: [{ email: to }],
              subject: options.subject,
              textContent: text,
            }),
          })
        : await fetch(RESEND_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${from.name} <${from.email}>`,
              reply_to: options.fromEmail,
              to: [to],
              subject: options.subject,
              text,
            }),
          });
    if (!response.ok) {
      const body = await response.text();
      return { email: to, ok: false, dryRun: false, error: `${response.status} ${body.slice(0, 200)}` };
    }
    return { email: to, ok: true, dryRun: false };
  } catch (error) {
    return { email: to, ok: false, dryRun: false, error: (error as Error).message };
  }
}
