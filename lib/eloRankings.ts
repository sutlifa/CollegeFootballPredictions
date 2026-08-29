import {
  applyHeadToHeadTiebreak,
  BLOWOUT_MARGIN,
  conferenceTier,
  enforceConferenceRecordOrder,
  expectedScore,
  lossToughness,
  marginMultiplier,
  preseasonStrengths,
} from "./computerRankings";
import type { Game, RankingRow, Team } from "./types";
import { isDecided } from "./types";

/**
 * Rank-driven Elo -- an ALTERNATIVE ranking model, off by default. See
 * lib/rankingModel.ts for the switch.
 *
 * Built to answer one question: should a game's effect be set by the rank
 * of the opponent at the moment it was played? Here it is -- the delta
 * comes from the rating gap, which is what a team's rank at that moment IS,
 * so beating the #1 team is worth roughly ten times beating the #120 team
 * and the ratio falls out of the expected-score curve rather than tuning.
 *
 * A caution for anyone re-running the comparison. The statistic that
 * motivated this file was average SPOTS GAINED by opponent rank, which
 * appeared to show the record model paying 2.91 spots for beating a top-10
 * team against 8.24 for beating a team ranked 81-138. That number is
 * confounded: teams that beat weak opponents are themselves mid-table, and
 * the middle of the board is bunched, so a tiny rating change buys many
 * places there. Controlling for the winner's own rank band, the record
 * model was already close to monotonic. Measure spots gained WITHIN a rank
 * band, or measure rating deltas directly -- the uncontrolled number
 * overstates the problem by a wide margin.
 *
 * Rating, not raw ordinal, drives the delta on purpose: the distance from
 * #1 to #2 is not the distance from #50 to #51, and using positions would
 * flatten exactly the difference this model exists to capture. Ordinals are
 * used only where a threshold is genuinely meant -- the big-win ledger.
 *
 * STATUS: implemented, measured, and NOT adopted. Run against two complete
 * seasons of real predictions it does deliver monotonic rank movement, but
 * it also reintroduces 399 and 433 cases of a badly-losing team ranked
 * above a much better record -- against zero in the record model -- and
 * drops four conference champions below teams with losing records. Every
 * team it promotes is a poor-record SEC or Big Ten side; every team it
 * demotes is a good-record Group of Six side.
 *
 * That is not a tuning failure, it is what Elo is. Elo is a PREDICTIVE
 * rating: a 3-9 SEC team that loses close to good teams is genuinely
 * strong by its measure, because each loss was expected and therefore
 * nearly free. A poll ranks RESUMES, not projected strength, so a pure Elo
 * ledger will always float bad teams from strong conferences. Making it
 * behave would mean adding back a record term -- which is the other model.
 *
 * The goal that motivated this file was met instead by raising QUALITY_K
 * from 12 to 36 in computerRankings.ts, a one-constant change that makes
 * movement monotonic while keeping every resume guarantee. This is kept as
 * the evidence for that decision, and because RANKING_MODEL=elo makes the
 * comparison reproducible rather than a claim in a commit message.
 *
 * Four parts:
 *
 *   rating = eloLedger + bigWinBonus + confChampAdjustment
 *
 *  - eloLedger starts at the preseason poll and is updated per game.
 *  - bigWinBonus is additive-only and locked at the moment of the win, so a
 *    beaten opponent collapsing later can never cost the team that beat
 *    them -- it can only fail to earn more.
 *  - confChampAdjustment matches the other model's treatment.
 *
 * Record is implicit: a team cannot accumulate without winning. The one
 * place record is still asserted outright is inside a conference, via the
 * shared enforceConferenceRecordOrder, so 12-1 still finishes above 11-2 in
 * the same league.
 */

/** Where the ladder is centred. Nothing depends on the value; it is a mean. */
const ELO_BASE = 1500;
/** Preseason seed spread: the poll leader starts near 1860, the last near 1140. */
const ELO_PER_SIGMA = 120;

/**
 * How much one game can move a team. Higher than a chess K because a
 * college season is twelve games, not hundreds: at K=40 a season's worth of
 * results can move a team a few hundred points, which is the range the
 * preseason seed spans. Much lower and the poll would never be escaped;
 * much higher and one September result would drown out everything.
 */
const ELO_K = 40;

/** Winning away from home, in Elo points. */
const ELO_ROAD_BONUS = 8;

/**
 * The big-win ledger: what a win over a top-10 (or top-25) team is worth on
 * top of the Elo delta, awarded on the opponent's rank AT THE TIME and
 * never taken back.
 *
 * Deliberately modest next to ELO_K. The Elo delta already pays for beating
 * a good team; this exists so that a season *full* of such wins reads
 * differently from one built on a single upset, which is the difference
 * between a real resume and a lucky Saturday.
 */
const BIG_WIN_TOP10 = 15;
const BIG_WIN_TOP25 = 8;

/**
 * Conference title, in Elo points. Sized against ELO_K so a title is worth
 * a little under one marquee win -- enough to separate a champion from a
 * team it is level with, not enough to overturn a season.
 */
const CONF_CHAMP_WIN = 30;
const CONF_CHAMP_CLOSE_LOSS = 6;
const CONF_CHAMP_BLOWOUT_LOSS = 21;

/**
 * Elo is zero-sum, and conferences are very nearly closed pools -- a MAC
 * team plays MAC teams. Left alone, a conference can inflate internally:
 * beating your peers lifts you and they lift each other, with too few
 * cross-conference games to correct it. This scales what a win is WORTH by
 * the opponent's conference, so credit earned inside a weak pool is
 * discounted at the point it is earned.
 *
 * Halved relative to the raw tier because the expected-score curve is
 * already doing part of this job -- a weak conference's teams carry lower
 * ratings, so beating them already pays less. Applying the full tier on top
 * would count the same fact twice.
 */
function winCreditFactor(loser: Team): number {
  return 0.5 + 0.5 * conferenceTier(loser);
}

/** Display: 0-100, 50 at the ladder's centre. Strictly increasing. */
const ELO_DISPLAY_SCALE = 320;

function toDisplayScore(rating: number): number {
  return (
    Math.round(
      (50 + 50 * Math.tanh((rating - ELO_BASE) / ELO_DISPLAY_SCALE)) * 1000,
    ) / 1000
  );
}

type Row = {
  team: Team;
  rating: number;
  score: number;
  wins: number;
  losses: number;
};

export function computeEloRankings(teams: Team[], games: Game[]): RankingRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const strengths = preseasonStrengths(teams);

  const elo = new Map<number, number>();
  const bigWins = new Map<number, number>();
  const champAdjust = new Map<number, number>();
  const wins = new Map<number, number>();
  const losses = new Map<number, number>();
  const regularWins = new Map<number, number>();
  const regularLosses = new Map<number, number>();
  const conferenceChampions = new Set<number>();

  for (const team of teams) {
    elo.set(
      team.id,
      team.isFbs
        ? ELO_BASE + ELO_PER_SIGMA * (strengths.get(team.id) ?? 0)
        : // Below every FBS team, so beating an FCS side is close to free.
          ELO_BASE - ELO_PER_SIGMA * 3.6,
    );
    bigWins.set(team.id, 0);
    champAdjust.set(team.id, 0);
    wins.set(team.id, 0);
    losses.set(team.id, 0);
    regularWins.set(team.id, 0);
    regularLosses.set(team.id, 0);
  }

  const decided = games
    .filter(isDecided)
    .filter((g) => g.predictedScoreTeam1 !== g.predictedScoreTeam2)
    .sort((a, b) => a.week - b.week || a.id - b.id);

  const headToHead = new Map<string, number>();

  // Ranks are recomputed at the start of each week, so "the rank of the
  // team you just beat" means where they stood going into that week --
  // not where they end up once the week's other results land.
  let currentWeek: number | null = null;
  let rankAtWeekStart = new Map<number, number>();
  const refreshRanks = () => {
    rankAtWeekStart = new Map(
      teams
        .filter((t) => t.isFbs)
        .sort((a, b) => (elo.get(b.id) ?? 0) - (elo.get(a.id) ?? 0))
        .map((t, i) => [t.id, i + 1]),
    );
  };

  for (const game of decided) {
    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!team1 || !team2) continue;

    if (game.week !== currentWeek) {
      currentWeek = game.week;
      refreshRanks();
    }

    const team1Won = game.predictedScoreTeam1 > game.predictedScoreTeam2;
    const winner = team1Won ? team1 : team2;
    const loser = team1Won ? team2 : team1;
    wins.set(winner.id, (wins.get(winner.id) ?? 0) + 1);
    losses.set(loser.id, (losses.get(loser.id) ?? 0) + 1);
    headToHead.set(
      winner.id < loser.id
        ? `${winner.id}_${loser.id}`
        : `${loser.id}_${winner.id}`,
      winner.id,
    );

    const margin = Math.abs(
      game.predictedScoreTeam1 - game.predictedScoreTeam2,
    );

    if (game.isConferenceChampionship) {
      conferenceChampions.add(winner.id);
      champAdjust.set(
        winner.id,
        (champAdjust.get(winner.id) ?? 0) + CONF_CHAMP_WIN,
      );
      champAdjust.set(
        loser.id,
        (champAdjust.get(loser.id) ?? 0) -
          (margin >= BLOWOUT_MARGIN
            ? CONF_CHAMP_BLOWOUT_LOSS
            : CONF_CHAMP_CLOSE_LOSS),
      );
      continue;
    }

    regularWins.set(winner.id, (regularWins.get(winner.id) ?? 0) + 1);
    regularLosses.set(loser.id, (regularLosses.get(loser.id) ?? 0) + 1);

    const winnerElo = elo.get(winner.id)!;
    const loserElo = elo.get(loser.id)!;

    // The whole point: the surprise of the result sets its size. Beating a
    // team rated far above you is nearly a full K; beating one far below is
    // worth almost nothing, however comfortable the win.
    const expected = expectedScore(winnerElo, loserElo);
    const mov = marginMultiplier(margin, winnerElo, loserElo);
    const base = ELO_K * (1 - expected) * mov;

    const winnerWonOnRoad =
      !game.isNeutralSite &&
      (team1Won ? game.team1IsHome === false : game.team1IsHome === true);
    const raw = base + (winnerWonOnRoad ? ELO_ROAD_BONUS : 0);

    elo.set(winner.id, winnerElo + raw * winCreditFactor(loser));
    elo.set(
      loser.id,
      loserElo - raw * lossToughness(conferenceTier(winner)),
    );

    if (loser.isFbs) {
      const loserRank = rankAtWeekStart.get(loser.id);
      if (loserRank !== undefined) {
        const bonus =
          loserRank <= 10
            ? BIG_WIN_TOP10
            : loserRank <= 25
              ? BIG_WIN_TOP25
              : 0;
        if (bonus) bigWins.set(winner.id, (bigWins.get(winner.id) ?? 0) + bonus);
      }
    }
  }

  const byRating: Row[] = teams
    .filter((t) => t.isFbs)
    .map((team) => {
      const rating =
        (elo.get(team.id) ?? ELO_BASE) +
        (bigWins.get(team.id) ?? 0) +
        (champAdjust.get(team.id) ?? 0);
      return {
        team,
        rating,
        score: toDisplayScore(rating),
        wins: wins.get(team.id) ?? 0,
        losses: losses.get(team.id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.team.name.localeCompare(b.team.name);
    });

  const sorted = enforceConferenceRecordOrder(
    applyHeadToHeadTiebreak(byRating, headToHead),
    (row) =>
      (regularWins.get(row.team.id) ?? 0) -
      (regularLosses.get(row.team.id) ?? 0) +
      (conferenceChampions.has(row.team.id) ? 0.5 : 0),
  );

  return sorted.map((row, i) => ({
    rank: i + 1,
    teamId: row.team.id,
    team: row.team.name,
    conference: row.team.conference,
    wins: row.wins,
    losses: row.losses,
    score: row.score,
  }));
}

/**
 * The board after each week that has games. Unlike the other model this is
 * genuinely a ledger, so a week's board is just the state after replaying
 * up to it -- but it is still replayed rather than cached, to keep the two
 * models interchangeable behind the same interface.
 */
export function computeWeeklyEloRankings(
  teams: Team[],
  games: Game[],
): { week: number; rankings: RankingRow[] }[] {
  const weeks = [...new Set(games.filter(isDecided).map((g) => g.week))].sort(
    (a, b) => a - b,
  );
  return weeks.map((week) => ({
    week,
    rankings: computeEloRankings(
      teams,
      games.filter((g) => g.week <= week),
    ),
  }));
}

/** Current board plus each team's movement since the previous played week. */
export function computeEloRankMovement(
  teams: Team[],
  games: Game[],
): { current: RankingRow[]; movement: Map<number, number | null> } {
  const weeks = [...new Set(games.filter(isDecided).map((g) => g.week))].sort(
    (a, b) => a - b,
  );
  const current = computeEloRankings(teams, games);
  const movement = new Map<number, number | null>();
  if (weeks.length < 2) {
    for (const row of current) movement.set(row.teamId, null);
    return { current, movement };
  }
  const previous = computeEloRankings(
    teams,
    games.filter((g) => g.week <= weeks[weeks.length - 2]),
  );
  const previousRank = new Map(previous.map((r) => [r.teamId, r.rank]));
  for (const row of current) {
    const before = previousRank.get(row.teamId);
    movement.set(row.teamId, before === undefined ? null : before - row.rank);
  }
  return { current, movement };
}
