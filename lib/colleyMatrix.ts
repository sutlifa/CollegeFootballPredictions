import type { Game, Team } from "./types";
import { isDecided } from "./types";

/**
 * The Colley Matrix method (Wesley Colley, 2001) -- one of the six official
 * BCS computer polls. Uses only wins and losses (no margin of victory, per
 * the BCS's own rule against rewarding blowouts) and produces a
 * "bias-free" rating that inherently accounts for strength of schedule: an
 * untested team rates exactly 0.500, and beating a good team helps your
 * rating more than beating a bad one.
 *
 * For n teams, build an n x n matrix C and a length-n vector b:
 *   C[i][i] = 2 + (games played by team i)
 *   C[i][j] = -(number of times i and j played each other), i != j
 *   b[i]    = 1 + (wins[i] - losses[i]) / 2
 * then solve C * r = b for the ratings vector r.
 *
 * Matches real-world Colley/BCS practice by only including games between
 * two FBS teams -- an FCS opponent isn't part of the FBS graph at all, so a
 * win over one contributes nothing to (or against) either team's rating
 * here. (Their overall win/loss record elsewhere in the app still counts
 * those games; only this rating computation excludes them.)
 */
export function computeColleyRatings(
  teams: Team[],
  games: Game[],
): Map<number, number> {
  const fbsTeams = teams.filter((t) => t.isFbs);
  const indexByTeamId = new Map(fbsTeams.map((t, i) => [t.id, i]));
  const n = fbsTeams.length;

  const gamesPlayed = new Array(n).fill(0);
  const wins = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  const headToHead = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const game of games) {
    if (!isDecided(game)) continue;
    if (game.predictedScoreTeam1 === game.predictedScoreTeam2) continue;
    const i = indexByTeamId.get(game.team1Id);
    const j = indexByTeamId.get(game.team2Id);
    if (i === undefined || j === undefined) continue; // one side isn't FBS

    gamesPlayed[i]++;
    gamesPlayed[j]++;
    headToHead[i][j]++;
    headToHead[j][i]++;

    if (game.predictedScoreTeam1 > game.predictedScoreTeam2) {
      wins[i]++;
      losses[j]++;
    } else {
      wins[j]++;
      losses[i]++;
    }
  }

  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    C[i][i] = 2 + gamesPlayed[i];
    for (let j = 0; j < n; j++) {
      if (i !== j) C[i][j] = -headToHead[i][j];
    }
    b[i] = 1 + (wins[i] - losses[i]) / 2;
  }

  const r = solveLinearSystem(C, b);

  const ratings = new Map<number, number>();
  fbsTeams.forEach((team, i) => ratings.set(team.id, r[i]));
  return ratings;
}

/**
 * Solves Ax = b via Gaussian elimination with partial pivoting. Colley's C
 * matrix is always symmetric positive-definite by construction (diagonally
 * dominant: each row's diagonal entry exceeds the sum of the absolute
 * values of the rest of the row), so this is always well-conditioned --
 * no special-casing for singularity needed.
 */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const A = matrix.map((row) => [...row]);
  const b = [...vector];

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivotRow][col])) pivotRow = row;
    }
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    const pivot = A[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / pivot;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) A[row][k] -= factor * A[col][k];
      b[row] -= factor * b[col];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
    x[row] = sum / A[row][row];
  }
  return x;
}
