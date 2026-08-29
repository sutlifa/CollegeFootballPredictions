import { auth } from "@/auth";
import { BracketFieldSelector } from "@/components/BracketFieldSelector";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { TrophyIcon } from "@/components/TrophyIcon";
import {
  BRACKET_ROUNDS,
  buildBracketState,
  currentBracketRound,
  getBracketCandidates,
  POWER_CONFERENCES,
  seedBracketField,
  type BracketRound,
  type BracketSlotGame,
  type Seed,
} from "@/lib/bracket";
import { computeRankings } from "@/lib/rankingModel";
import {
  getAllGames,
  getAllTeams,
  getBracketField,
  getBracketPicks,
  getSubmittedWeeks,
} from "@/lib/queries";
import {
  resetBracketFieldAction,
  saveRoundPicksAction,
  setBracketFieldAction,
} from "./actions";

export const dynamic = "force-dynamic";

const ROUND_LABEL: Record<BracketRound, string> = {
  round1: "Round 1",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  championship: "Championship",
};

export default async function BracketPage({
  searchParams,
}: PageProps<"/bracket">) {
  const { editRound } = await searchParams;
  const session = await auth();
  const userId = session!.user.id;
  const [teams, games, selectedTeamIds, submittedWeeks] = await Promise.all([
    getAllTeams(),
    getAllGames(userId),
    getBracketField(userId),
    getSubmittedWeeks(userId),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const submitted = new Set(submittedWeeks);
  const rankings = computeRankings(
    teams,
    games.filter((g) => submitted.has(g.week)),
  );
  const candidates = getBracketCandidates(games, rankings);

  if (selectedTeamIds) {
    const seeds = seedBracketField(selectedTeamIds, rankings);
    const picks = await getBracketPicks(userId);
    const slotGames = buildBracketState(seeds, picks);
    const autoActiveRound = currentBracketRound(slotGames);
    const requestedEditRound = BRACKET_ROUNDS.includes(editRound as BracketRound)
      ? (editRound as BracketRound)
      : null;
    const displayRound = requestedEditRound ?? autoActiveRound;
    const isComplete = autoActiveRound === null;
    const champion = isComplete
      ? slotGames.find((g) => g.slot === "championship")?.pickedWinner
      : null;

    const gamesBySlotRound = (round: BracketRound) =>
      slotGames.filter((g) => g.round === round);

    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <TrophyIcon size={88} />
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
            {champion ? `${champion.team} -- National Champion` : "Playoff Bracket"}
            <Tooltip text="Pick the winner of every game, round by round -- Round 1, Quarterfinal, Semifinal, then the Championship. Matchups follow the real fixed CFP bracket (no reseeding): 1 vs winner of 8/9, 2 vs winner of 7/10, 3 vs winner of 6/11, 4 vs winner of 5/12, then the semifinal and championship follow from there. Changing an earlier round's pick clears anything you picked after it, since those matchups depended on it." />
          </h1>
        </div>
        <div className="flex items-center justify-end">
          <form action={resetBracketFieldAction}>
            <button
              type="submit"
              className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-accent hover:text-accent-strong"
            >
              Edit 12-team field
            </button>
          </form>
        </div>

        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {seeds.map((s) => (
            <li
              key={s.teamId}
              className="rounded-lg border border-line bg-surface p-3 text-ink"
            >
              <span className="font-bold text-accent-strong">#{s.seed}</span>{" "}
              <span className="inline-flex items-center gap-2">
                <TeamLogo logoUrl={teamById.get(s.teamId)?.logoUrl} name={s.team} size={20} />
                {s.team}
              </span>{" "}
              <span className="text-ink-muted">
                ({s.wins}-{s.losses}, {s.score.toFixed(3)} score)
              </span>
              {s.seed <= 4 && (
                <span
                  className="ml-2 rounded bg-win/20 px-1.5 py-0.5 text-xs font-bold text-win"
                  title="Top 4 seeds skip Round 1 and enter in the quarterfinals"
                >
                  BYE
                </span>
              )}
            </li>
          ))}
        </ol>

        {(() => {
          const activeIndex = requestedEditRound
            ? BRACKET_ROUNDS.indexOf(requestedEditRound)
            : autoActiveRound !== null
              ? BRACKET_ROUNDS.indexOf(autoActiveRound)
              : BRACKET_ROUNDS.length;

          return BRACKET_ROUNDS.map((round, i) => {
          if (i > activeIndex) return null; // future round, not reachable yet
          const roundGames = gamesBySlotRound(round);

          if (i === activeIndex) {
            return (
              <div key={round} className="space-y-3 rounded-lg border border-accent/50 bg-accent/5 p-4">
                <form action={saveRoundPicksAction} className="space-y-4">
                  <input type="hidden" name="round" value={round} />
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-ink">
                      {ROUND_LABEL[round]} -- pick a winner for every game
                    </h2>
                    <button
                      type="submit"
                      className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
                    >
                      Submit {ROUND_LABEL[round]} Picks
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {roundGames.map((g) => (
                      <BracketGameCard key={g.slot} game={g} teamById={teamById} />
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
                    >
                      Submit {ROUND_LABEL[round]} Picks
                    </button>
                  </div>
                </form>
              </div>
            );
          }

          // Completed round -- read-only summary with an Edit link.
          return (
            <div key={round} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink">{ROUND_LABEL[round]}</h2>
                <a
                  href={`/bracket?editRound=${round}`}
                  className="rounded border border-line-strong px-2.5 py-1 text-xs text-ink-soft hover:border-accent hover:text-accent-strong"
                >
                  Edit
                </a>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {roundGames.map((g) => (
                  <div key={g.slot} className="rounded-lg border border-line bg-surface p-3 text-sm">
                    <TeamLine team={g.team1} teamById={teamById} isWinner={g.pickedWinner?.teamId === g.team1?.teamId} />
                    <TeamLine team={g.team2} teamById={teamById} isWinner={g.pickedWinner?.teamId === g.team2?.teamId} />
                  </div>
                ))}
              </div>
            </div>
          );
          });
        })()}
      </div>
    );
  }

  const decidedPowerConferences = new Set(
    candidates.powerChampions.map((c) => c.conference),
  );
  const fieldCandidates = candidates.rankings.map((row) => ({
    ...row,
    logoUrl: teamById.get(row.teamId)?.logoUrl ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <TrophyIcon size={88} />
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          Select the 12-Team Field
          <Tooltip text="Nothing is auto-selected except the guaranteed automatic bids. Under the real 2026-27 CFP rules: the ACC, Big 12, Big Ten, and SEC champions each get an automatic bid no matter how they're ranked; the Group of Six (American, CUSA, MAC, Mountain West, Pac 12, Sun Belt) gets exactly one automatic bid, given to whichever G6 team is rated highest -- champion or not. Notre Dame and other independents have no automatic path; they're at-large candidates like anyone else." />
        </h1>
        <p className="max-w-xl text-ink-muted">
          Automatic-bid teams are locked in below and can&apos;t be
          unchecked. Pick your at-large teams to fill out the 12 -- once
          you&apos;ve picked enough, the rest lock until you free up a spot.
          After confirming, you&apos;ll pick the winner of every playoff
          game round by round.
        </p>
      </div>

      {decidedPowerConferences.size < POWER_CONFERENCES.length && (
        <p className="rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-strong">
          Only {decidedPowerConferences.size} of {POWER_CONFERENCES.length}{" "}
          guaranteed-bid conference championships (ACC, Big 12, Big Ten, SEC)
          are decided so far. You can still select a field, but you may want
          to finish predicting Championship Week first.
        </p>
      )}
      {candidates.groupOfSixAutoBid && (
        <p className="text-sm text-ink-muted">
          Current Group of Six auto bid:{" "}
          <span className="font-semibold text-ink">
            {candidates.groupOfSixAutoBid.team}
          </span>{" "}
          ({candidates.groupOfSixAutoBid.conference}) -- the highest-ranked
          Group of Six team so far, champion or not. This can change as more
          weeks are submitted.
        </p>
      )}

      <BracketFieldSelector
        candidates={fieldCandidates}
        formAction={setBracketFieldAction}
      />
    </div>
  );
}

function TeamLine({
  team,
  teamById,
  isWinner,
}: {
  team: Seed | null;
  teamById: Map<number, { logoUrl: string | null }>;
  isWinner: boolean;
}) {
  if (!team) return <div className="text-ink-muted">TBD</div>;
  return (
    <div
      className={`flex items-center gap-2 ${isWinner ? "font-semibold text-win" : "text-ink-muted"}`}
    >
      <span className="w-6 text-right text-xs">#{team.seed}</span>
      <TeamLogo logoUrl={teamById.get(team.teamId)?.logoUrl} name={team.team} size={18} />
      {team.team}
      {isWinner && <span className="text-xs">✓</span>}
    </div>
  );
}

function BracketGameCard({
  game,
  teamById,
}: {
  game: BracketSlotGame;
  teamById: Map<number, { logoUrl: string | null }>;
}) {
  const { slot, team1, team2, pickedWinner } = game;
  if (!team1 || !team2) {
    return (
      <div className="rounded-lg border border-line bg-surface p-3 text-sm text-ink-muted">
        Waiting on an earlier round&apos;s pick...
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface p-2">
      {[team1, team2].map((team) => (
        <label
          key={team.teamId}
          className="flex cursor-pointer items-center gap-2 rounded border border-line-strong bg-field px-2 py-2 text-sm text-ink has-checked:border-win has-checked:bg-win/20 has-checked:text-win has-checked:font-semibold"
        >
          <input
            type="radio"
            name={`pick_${slot}`}
            value={team.teamId}
            defaultChecked={pickedWinner?.teamId === team.teamId}
            required
            className="sr-only"
          />
          <span className="w-6 text-right text-xs">#{team.seed}</span>
          <TeamLogo logoUrl={teamById.get(team.teamId)?.logoUrl} name={team.team} size={18} />
          <span className="truncate">{team.team}</span>
        </label>
      ))}
    </div>
  );
}
