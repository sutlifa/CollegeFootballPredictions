export type Team = {
  id: number;
  cfbdTeamId: number | null;
  name: string;
  conference: string;
  preseasonRank: number | null;
  logoUrl: string | null;
  isFbs: boolean;
};

/** "Idaho State (FCS)" for non-FBS opponents, matching the original spreadsheet's convention -- otherwise just the name. */
export function displayTeamName(team: Pick<Team, "name" | "isFbs"> | undefined): string {
  if (!team) return "Unknown";
  return team.isFbs ? team.name : `${team.name} (FCS)`;
}

export type GameStatus = "scheduled" | "in_progress" | "final";

export type Game = {
  id: number;
  cfbdGameId: string | null;
  season: number;
  week: number;
  team1Id: number;
  team2Id: number;
  team1IsHome: boolean | null;
  isNeutralSite: boolean;
  conference: string | null;
  isConferenceChampionship: boolean;
  kickoffAt: string | null;
  status: GameStatus;
  predictedScoreTeam1: number | null;
  predictedScoreTeam2: number | null;
  actualScoreTeam1: number | null;
  actualScoreTeam2: number | null;
};

export type DecidedGame = Game & {
  predictedScoreTeam1: number;
  predictedScoreTeam2: number;
};

export function isDecided(game: Game): game is DecidedGame {
  return (
    game.predictedScoreTeam1 !== null && game.predictedScoreTeam2 !== null
  );
}

export type StandingsRow = {
  teamId: number;
  team: string;
  conference: string;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  preseasonRank: number | null;
};

export type RankingRow = {
  rank: number;
  teamId: number;
  team: string;
  conference: string;
  wins: number;
  losses: number;
  score: number;
};
