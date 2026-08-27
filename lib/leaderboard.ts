export type LeaderboardRow = {
  userId: number;
  displayName: string;
  /** Predictions entered, whether or not that game has a real result yet. */
  picksMade: number;
  /** Games this user could pick this season (shared schedule + their own Week 16). */
  gamesAvailable: number;
  pickedPct: number; // 0-1
  /** Of this user's picks, how many have a real result to score against yet. */
  totalPicks: number;
  correctPicks: number;
  correctPct: number; // 0-1
  avgMarginDiff: number | null; // null if this user has zero correct picks yet
};

/** True once at least one real result exists to score anyone against. */
export function hasGradedResults(rows: LeaderboardRow[]): boolean {
  return rows.some((r) => r.totalPicks > 0);
}

/**
 * "John Doe" -> "John D." -- never the full last name, so the public
 * leaderboard doesn't display a real full name. Falls back to the email's
 * local part if Google didn't give us a name for some reason.
 */
export function formatDisplayName(
  name: string | null,
  email: string,
): string {
  const source = name?.trim() || email.split("@")[0];
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Anonymous";
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

/**
 * Anyone with real results to be scored on ranks above anyone without,
 * sorted by correct-pick percentage then average margin error (lower is
 * better). Users with nothing scored yet -- everyone, before the season
 * starts -- fall below that and are ordered by how much of their slate
 * they've actually filled in, so the preseason board is a meaningful
 * "who's furthest along" list instead of an alphabetical list of zeroes.
 */
export function sortLeaderboard(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    const aScored = a.totalPicks > 0;
    const bScored = b.totalPicks > 0;
    if (aScored !== bScored) return aScored ? -1 : 1;

    if (!aScored) {
      if (b.picksMade !== a.picksMade) return b.picksMade - a.picksMade;
      return a.displayName.localeCompare(b.displayName);
    }

    if (b.correctPct !== a.correctPct) return b.correctPct - a.correctPct;
    if (a.avgMarginDiff === null && b.avgMarginDiff === null) {
      return a.displayName.localeCompare(b.displayName);
    }
    if (a.avgMarginDiff === null) return 1;
    if (b.avgMarginDiff === null) return -1;
    if (a.avgMarginDiff !== b.avgMarginDiff) {
      return a.avgMarginDiff - b.avgMarginDiff;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}
