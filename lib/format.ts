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

const dateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/**
 * e.g. "Sat, Aug 29, 12:00 PM EDT" -- shows EST or EDT correctly for the
 * date, not hardcoded.
 *
 * When CFBD hasn't published a kickoff time yet it still gives a date, with
 * midnight Eastern standing in for the time. Rendering that verbatim showed
 * a wall of games at "12:00 AM", which isn't a real time and reads as a
 * bug. Those show the day with "TBD" in place of the time instead.
 *
 * The day is taken from the same Eastern-time instant either way, so a
 * TBD game lands on the date CFBD actually intends. (Do NOT infer TBD from
 * a midnight timestamp -- a genuine late kickoff on the west coast or in
 * Hawaii can legitimately be midnight Eastern. Only CFBD's own
 * startTimeTBD flag decides this.)
 */
export function formatKickoff(
  kickoffAt: string | null,
  kickoffTbd = false,
): string {
  if (!kickoffAt) return "TBD";
  const date = new Date(kickoffAt);
  if (Number.isNaN(date.getTime())) return "TBD";
  if (kickoffTbd) return `${dateOnlyFormatter.format(date)} — TBD`;
  return kickoffFormatter.format(date);
}
