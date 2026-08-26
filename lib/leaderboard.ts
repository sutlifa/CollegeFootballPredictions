export type LeaderboardRow = {
  userId: number;
  displayName: string;
  correctPicks: number;
  totalPicks: number;
  correctPct: number; // 0-1
  avgMarginDiff: number | null; // null if this user has zero correct picks yet
};

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

/** Sorted by correct-pick percentage first, then average margin error (lower is better) as the tiebreaker. */
export function sortLeaderboard(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (b.correctPct !== a.correctPct) return b.correctPct - a.correctPct;
    if (a.avgMarginDiff === null && b.avgMarginDiff === null) return 0;
    if (a.avgMarginDiff === null) return 1;
    if (b.avgMarginDiff === null) return -1;
    if (a.avgMarginDiff !== b.avgMarginDiff) {
      return a.avgMarginDiff - b.avgMarginDiff;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}
