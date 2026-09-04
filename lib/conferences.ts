// The 10 conferences that hold a championship game (and drive Week 16).
// Only Independent doesn't.
//
// The rebuilt 8-team Pac 12 plays a title game between its top two, and was
// missing from this list. That was not merely a missing fixture: Pac 12 is
// one of the GROUP_OF_SIX_CONFERENCES, and the playoff's fifth automatic
// bid goes to the highest-ranked Group of Six CHAMPION -- so a conference
// that can never produce a champion can never receive that bid. All eight
// Pac 12 teams were structurally excluded from the playoff, Boise State
// included, despite finishing as the second-highest Group of Six team on
// one real board.
export const CHAMPIONSHIP_CONFERENCES = [
  "ACC",
  "American",
  "Big 12",
  "Big Ten",
  "CUSA",
  "MAC",
  "Mountain West",
  "Pac 12",
  "SEC",
  "Sun Belt",
] as const;

// The Sun Belt is the only one of the 9 championship conferences still
// split into divisions (as of the 2026 season) -- its championship game is
// East champ vs. West champ, not the conference's top two teams overall.
// Team names match this app's canonical `teams.name` values exactly.
export const SUN_BELT_DIVISIONS: Record<"East" | "West", string[]> = {
  East: [
    "App State",
    "Coastal Carolina",
    "Georgia Southern",
    "Georgia State",
    "James Madison",
    "Marshall",
    "Old Dominion",
  ],
  West: [
    "Arkansas State",
    "Louisiana",
    "Louisiana Tech",
    "South Alabama",
    "Southern Miss",
    "Troy",
    "UL Monroe",
  ],
};

export function sunBeltDivision(teamName: string): "East" | "West" | null {
  if (SUN_BELT_DIVISIONS.East.includes(teamName)) return "East";
  if (SUN_BELT_DIVISIONS.West.includes(teamName)) return "West";
  return null;
}

/**
 * Key used to store/look up a conference's finalized standings order (see
 * lib/conferenceTiebreakers.ts and lib/queries.ts): plain conference name
 * for everyone except the Sun Belt, which gets one key per division.
 */
export function conferenceDivisionKey(conference: string, division: string): string {
  return division === "ALL" ? conference : `${conference} (${division})`;
}

// CollegeFootballData.com labels conferences differently than our canonical
// names (which match the original spreadsheet's Teams tab). Applied once at
// team-seeding time (scripts/resolve-cfbd-team-ids.ts) so the rest of the
// app only ever sees our canonical labels.
export const CFBD_CONFERENCE_ALIASES: Record<string, string> = {
  "American Athletic": "American",
  "Conference USA": "CUSA",
  "FBS Independents": "Independent",
  "Mid-American": "MAC",
  "Pac-12": "Pac 12",
};

export function normalizeCfbdConference(conference: string | null): string {
  if (!conference) return "Independent";
  return CFBD_CONFERENCE_ALIASES[conference] ?? conference;
}
