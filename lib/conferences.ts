// The 9 conferences that hold a championship game (and drive Week 16).
// Pac 12 and Independent don't.
export const CHAMPIONSHIP_CONFERENCES = [
  "ACC",
  "American",
  "Big 12",
  "Big Ten",
  "CUSA",
  "MAC",
  "Mountain West",
  "SEC",
  "Sun Belt",
] as const;

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
