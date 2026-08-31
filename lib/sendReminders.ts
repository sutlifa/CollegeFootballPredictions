import { sendReminder, emailEnabled } from "./email";
import {
  backfillUnsubscribeTokens,
  getReminderUsers,
  getSentReminders,
  getWeekProgress,
  getWeekStates,
  recordReminderSent,
} from "./queries";
import { nextWeekNeedingReminder, recipientsFor } from "./reminders";

export type ReminderRunResult = {
  /** Null when no week is close enough to lock to be worth mailing about. */
  week: number | null;
  kind: string | null;
  considered: number;
  sent: number;
  failed: number;
  /** True when nothing left the building because sending is disabled. */
  dryRun: boolean;
  recipients: string[];
};

/**
 * One pass of the weekly reminder. Folded into the existing daily cron
 * rather than given its own schedule -- the Hobby plan caps how many cron
 * jobs a project gets, and there is no reason for a second one.
 *
 * Every attempt is written to email_sends whether it succeeded or not, and
 * only successful rows count as "already sent", so a failure is retried on
 * the next run while a success never repeats.
 */
export async function runWeeklyReminders(
  now = new Date(),
): Promise<ReminderRunResult> {
  const dryRun = !emailEnabled();
  const [users, weeks] = await Promise.all([
    getReminderUsers(),
    getWeekStates(),
  ]);

  const target = nextWeekNeedingReminder(weeks, now);
  if (!target) {
    return { week: null, kind: null, considered: 0, sent: 0, failed: 0, dryRun, recipients: [] };
  }

  const [progress, alreadySent] = await Promise.all([
    getWeekProgress(target.week.week),
    getSentReminders(target.week.week),
  ]);

  // Anyone who signed in before reminders existed has no token yet, and a
  // reminder without a working unsubscribe link should not go out at all.
  if (!dryRun && users.some((u) => u.emailReminders && !u.unsubscribeToken)) {
    await backfillUnsubscribeTokens();
  }
  const withTokens = dryRun ? users : await getReminderUsers();

  const recipients = recipientsFor(
    withTokens,
    target.week,
    target.kind,
    progress,
    alreadySent,
  );

  let sent = 0;
  let failed = 0;
  for (const decision of recipients) {
    const outcome = await sendReminder(decision, now);
    if (outcome.dryRun) continue; // nothing sent, so nothing to record
    await recordReminderSent(
      decision.userId,
      decision.week,
      decision.kind,
      outcome.ok ? null : (outcome.error ?? "unknown error"),
    );
    if (outcome.ok) sent++;
    else failed++;
  }

  return {
    week: target.week.week,
    kind: target.kind,
    considered: recipients.length,
    sent,
    failed,
    dryRun,
    recipients: recipients.map((r) => r.email),
  };
}
