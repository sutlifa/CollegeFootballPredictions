import type { Game, StandingsRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * Ports the Apps Script `updateStandings()` win/loss tallying exactly, with
 * one addition: every FBS team is included from the start (0-0, prefilled),
 * not just teams that have already played a decided game -- so the page
 * reads as a real conference standings table from week 1 on, not an empty
 * table that fills in as scores come in.
 *
 * Sort: conference asc -> conf wins desc -> conf losses asc -> overall wins
 * desc -> overall losses asc -> preseason rank asc -> team name asc. The
 * preseason-rank tiebreak only matters while records are still equal (most
 * visibly before any games are decided), so the initial table reads in a
 * sensible preseason order instead of alphabetically, and real results take
 * over the ordering as soon as they create a difference.
 */
export function computeStandings(
  teams: Team[],
  games: Game[],
): StandingsRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rows = new Map<number, StandingsRow>();

  for (const team of teams) {
    if (!team.isFbs) continue;
    rows.set(team.id, {
      teamId: team.id,
      team: team.name,
      conference: team.conference,
      wins: 0,
      losses: 0,
      confWins: 0,
      confLosses: 0,
      preseasonRank: team.preseasonRank,
    });
  }

  for (const game of games) {
    if (!isDecided(game)) continue;
    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!team1 || !team2) continue;

    const team1Row = team1.isFbs ? rows.get(team1.id) : undefined;
    const team2Row = team2.isFbs ? rows.get(team2.id) : undefined;
    const sameConference =
      team1.isFbs && team2.isFbs && team1.conference === team2.conference;

    const score1 = game.predictedScoreTeam1;
    const score2 = game.predictedScoreTeam2;
    if (score1 === score2) continue; // ties ignored, as in the original script

    const winnerRow = score1 > score2 ? team1Row : team2Row;
    const loserRow = score1 > score2 ? team2Row : team1Row;

    if (winnerRow) winnerRow.wins++;
    if (loserRow) loserRow.losses++;
    if (sameConference) {
      if (winnerRow) winnerRow.confWins++;
      if (loserRow) loserRow.confLosses++;
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.conference !== b.conference)
      return a.conference < b.conference ? -1 : 1;
    if (b.confWins !== a.confWins) return b.confWins - a.confWins;
    if (a.confLosses !== b.confLosses) return a.confLosses - b.confLosses;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    const aRank = a.preseasonRank ?? Infinity;
    const bRank = b.preseasonRank ?? Infinity;
    if (aRank !== bRank) return aRank - bRank;
    return a.team.localeCompare(b.team);
  });
}

/** Standings restricted to one conference -- used to derive Week 16 pairings. */
export function computeConferenceStandings(
  teams: Team[],
  games: Game[],
  conference: string,
): StandingsRow[] {
  return computeStandings(teams, games).filter(
    (row) => row.conference === conference,
  );
}

export function groupStandingsByConference(
  rows: StandingsRow[],
): Map<string, StandingsRow[]> {
  const grouped = new Map<string, StandingsRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.conference) ?? [];
    list.push(row);
    grouped.set(row.conference, list);
  }
  return grouped;
}
