import {
  BASE_WIN_VALUES,
  CHAMPIONSHIP_MULTIPLIERS,
  DEFAULT_BASE_WIN_VALUE,
  LOSS_PENALTY,
  ROAD_WIN_BONUS,
  isPower4,
} from "./conferences";
import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

type TeamRecord = {
  team: Team;
  wins: number;
  losses: number;
  score: number;
};

/**
 * Ports the Apps Script `updateComputerRankings()` exactly, with one
 * deliberate deviation: the road-win bonus keys off ESPN's real
 * team1IsHome/isNeutralSite flags instead of the sheet's "Team 2 is always
 * the road team" row-position convention.
 */
export function computeComputerRankings(
  teams: Team[],
  games: Game[],
): RankingRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const records = new Map<number, TeamRecord>();

  function ensure(team: Team): TeamRecord {
    let rec = records.get(team.id);
    if (!rec) {
      rec = { team, wins: 0, losses: 0, score: 0 };
      records.set(team.id, rec);
    }
    return rec;
  }

  const decided = games.filter(isDecided);

  // Pass 1: records (every decided game counts here, FCS included, since a
  // loser's win% is looked up regardless of whether they're FBS).
  for (const game of decided) {
    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!team1 || !team2) continue;
    const rec1 = ensure(team1);
    const rec2 = ensure(team2);
    if (game.predictedScoreTeam1 > game.predictedScoreTeam2) {
      rec1.wins++;
      rec2.losses++;
    } else if (game.predictedScoreTeam2 > game.predictedScoreTeam1) {
      rec2.wins++;
      rec1.losses++;
    }
  }

  // Pass 2: per-game score contributions.
  for (const game of decided) {
    if (game.predictedScoreTeam1 === game.predictedScoreTeam2) continue;

    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!team1 || !team2) continue;

    const team1Won = game.predictedScoreTeam1 > game.predictedScoreTeam2;
    const winner = team1Won ? team1 : team2;
    const loser = team1Won ? team2 : team1;
    const winnerRec = ensure(winner);
    const loserRec = ensure(loser);

    const winnerConf = winner.conference;
    const loserConf = loser.conference;

    const baseVal = BASE_WIN_VALUES[loserConf] ?? DEFAULT_BASE_WIN_VALUE;

    let oppStrengthFactor = 0;
    const loserTotalGames = loserRec.wins + loserRec.losses;
    if (loserTotalGames > 0) {
      const oppConfMult = isPower4(loserConf)
        ? 1.0
        : loserConf === "FCS"
          ? 0.5
          : 0.85;
      oppStrengthFactor = (loserRec.wins / loserTotalGames) * oppConfMult;
    }

    let gameScore = baseVal + oppStrengthFactor;

    // Road bonus: winner was the designated away team (deviation from the
    // sheet's "Team 2 = road team" convention -- see module docstring).
    const winnerIsTeam1 = winner.id === team1.id;
    const winnerIsAway = game.isNeutralSite
      ? false
      : winnerIsTeam1
        ? game.team1IsHome === false
        : game.team1IsHome === true;
    if (winnerIsAway) gameScore += ROAD_WIN_BONUS;

    if (game.week === 16) {
      const champMult = CHAMPIONSHIP_MULTIPLIERS[winnerConf] ?? 1.0;
      gameScore *= champMult;
    }

    winnerRec.score += gameScore;

    if (isPower4(loserConf) && !isPower4(winnerConf)) {
      loserRec.score = Math.max(0, loserRec.score - LOSS_PENALTY);
    }
  }

  const sorted = Array.from(records.values())
    .filter((rec) => rec.team.isFbs)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.team.name.localeCompare(b.team.name);
    });

  return sorted.map((rec, i) => ({
    rank: i + 1,
    teamId: rec.team.id,
    team: rec.team.name,
    conference: rec.team.conference,
    wins: rec.wins,
    losses: rec.losses,
    score: Math.round(rec.score * 100) / 100,
  }));
}
