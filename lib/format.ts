/**
 * Week 15 in the real CFB calendar is just the Army-Navy game (everyone
 * else is done with the regular season by then); Week 16 is our derived
 * conference championship slate. Both get a name instead of a bare number
 * everywhere a week is displayed.
 */
export function getWeekLabel(week: number): string {
  if (week === 15) return "Army Navy Game";
  if (week === 16) return "Conference Championship";
  return `Week ${week}`;
}

const kickoffFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** e.g. "Sat, Aug 29, 12:00 PM EDT" -- shows EST or EDT correctly for the date, not hardcoded. */
export function formatKickoff(kickoffAt: string | null): string {
  if (!kickoffAt) return "TBD";
  const date = new Date(kickoffAt);
  if (Number.isNaN(date.getTime())) return "TBD";
  return kickoffFormatter.format(date);
}
