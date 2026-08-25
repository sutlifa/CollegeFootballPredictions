export const POWER4 = ["ACC", "Big Ten", "Big 12", "SEC"] as const;

// The 9 conferences that hold a championship game (and drive Week 16 + the
// computer-rankings championship multiplier). Pac 12 and Independent don't.
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

export const BASE_WIN_VALUES: Record<string, number> = {
  ACC: 2.5,
  "Big Ten": 3.0,
  "Big 12": 2.5,
  SEC: 3.0,
  American: 2.3,
  "Mountain West": 2.1,
  "Sun Belt": 2.0,
  MAC: 1.9,
  CUSA: 1.8,
  FCS: 1.5,
};
export const DEFAULT_BASE_WIN_VALUE = 2.0;

export const CHAMPIONSHIP_MULTIPLIERS: Record<string, number> = {
  ACC: 1.15,
  "Big Ten": 1.25,
  "Big 12": 1.15,
  SEC: 1.25,
  American: 1.1,
  "Mountain West": 1.1,
  "Sun Belt": 1.1,
  MAC: 1.05,
  CUSA: 1.05,
};

export const LOSS_PENALTY = 2.5;
export const ROAD_WIN_BONUS = 0.3;

export function isPower4(conference: string): boolean {
  return (POWER4 as readonly string[]).includes(conference);
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
