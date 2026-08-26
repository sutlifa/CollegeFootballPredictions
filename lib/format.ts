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

/**
 * Week 14 doesn't exist in the current season's real schedule -- no FBS
 * games are played that week. Week 0 is the season-opening Aug 29 slate,
 * which CFBD lumps into the same "week 1" bucket as the following weekend's
 * games (see lib/ingest.ts resolveWeek) -- split out here so a team playing
 * both isn't double-counted as one calendar week.
 */
export const VALID_WEEKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16];

export function isValidWeek(week: number): boolean {
  return VALID_WEEKS.includes(week);
}

/** Every week except 16 (the derived conference championship slate). */
export const REGULAR_SEASON_WEEKS = VALID_WEEKS.filter((w) => w !== 16);

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
