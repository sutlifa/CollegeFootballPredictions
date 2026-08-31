/**
 * Who should be emailed about which week, and why.
 *
 * Deliberately pure and DB-free: deciding to email real people is the one
 * piece of this app where being wrong is not recoverable by editing a row,
 * so it has to be testable against a fixed clock without a database or a
 * mail provider anywhere near it.
 *
 * TIMING IS SHAPED BY THE CRON, NOT BY PREFERENCE. Vercel's Hobby plan runs
 * cron once a day, which cannot hit a narrow window: a week locking at
 * 23:00 UTC is ten hours away at the 13:00 run and already locked by the
 * next one, so a literal "six hours before" reminder would simply never
 * fire for most weeks. "Last call" therefore means the LAST SCHEDULED RUN
 * BEFORE LOCK -- within 24 hours -- which is the tightest promise a daily
 * job can actually keep.
 */

/** Hours before lock. A week enters the nudge window at 72h and the last-call window at 24h. */
export const NUDGE_HOURS = 72;
export const LAST_CALL_HOURS = 24;

export type ReminderKind = "nudge" | "last_call";

export type ReminderUser = {
  userId: number;
  email: string;
  name: string | null;
  /** False once they have opted out; they are never mailed again. */
  emailReminders: boolean;
  unsubscribeToken: string | null;
};

export type WeekState = {
  week: number;
  locksAt: Date;
  /** Games in the week that everyone shares (week 16 is per-user and excluded). */
  totalGames: number;
};

export type UserWeekProgress = {
  userId: number;
  week: number;
  picksMade: number;
};

export type ReminderDecision = {
  userId: number;
  email: string;
  name: string | null;
  week: number;
  kind: ReminderKind;
  locksAt: Date;
  picksMade: number;
  totalGames: number;
  missing: number;
  unsubscribeToken: string | null;
};

/**
 * The one week worth reminding about right now: the soonest week that has
 * not locked yet and is close enough to matter. Weeks already locked are
 * past helping, and a week three weeks out is noise.
 */
export function nextWeekNeedingReminder(
  weeks: WeekState[],
  now: Date,
): { week: WeekState; kind: ReminderKind } | null {
  const upcoming = weeks
    .filter((w) => w.locksAt.getTime() > now.getTime())
    .sort((a, b) => a.locksAt.getTime() - b.locksAt.getTime())[0];
  if (!upcoming) return null;

  const hoursOut =
    (upcoming.locksAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursOut <= LAST_CALL_HOURS) return { week: upcoming, kind: "last_call" };
  if (hoursOut <= NUDGE_HOURS) return { week: upcoming, kind: "nudge" };
  return null;
}

/**
 * Everyone who should get this reminder. A person is skipped when they have
 * opted out, when their picks for the week are already complete, or when
 * they have had this exact reminder before -- `alreadySent` is the ledger of
 * (user, week, kind) rows, so a retried or double-fired cron is harmless.
 *
 * Someone with zero picks is included: they are exactly who the reminder is
 * for. A week with no games is not a reminder at all.
 */
export function recipientsFor(
  users: ReminderUser[],
  week: WeekState,
  kind: ReminderKind,
  progress: UserWeekProgress[],
  alreadySent: ReadonlySet<string>,
): ReminderDecision[] {
  if (week.totalGames === 0) return [];

  const picksByUser = new Map(
    progress
      .filter((p) => p.week === week.week)
      .map((p) => [p.userId, p.picksMade]),
  );

  const out: ReminderDecision[] = [];
  for (const user of users) {
    if (!user.emailReminders) continue;
    if (alreadySent.has(sendKey(user.userId, week.week, kind))) continue;
    const picksMade = picksByUser.get(user.userId) ?? 0;
    if (picksMade >= week.totalGames) continue;
    out.push({
      userId: user.userId,
      email: user.email,
      name: user.name,
      week: week.week,
      kind,
      locksAt: week.locksAt,
      picksMade,
      totalGames: week.totalGames,
      missing: week.totalGames - picksMade,
      unsubscribeToken: user.unsubscribeToken,
    });
  }
  return out;
}

/** Ledger key for a single (user, week, kind) reminder. */
export function sendKey(
  userId: number,
  week: number,
  kind: ReminderKind,
): string {
  return `${userId}:${week}:${kind}`;
}
