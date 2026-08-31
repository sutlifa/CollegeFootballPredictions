import Link from "next/link";
import { auth } from "@/auth";
import { TeamLogo } from "@/components/TeamLogo";
import { Tooltip } from "@/components/Tooltip";
import { getWeekLabel, isValidWeek, REGULAR_SEASON_WEEKS } from "@/lib/format";
import { MARGIN_BUCKETS, isMarginBucketId } from "@/lib/margin";
import {
  getAllTeams,
  getCompareUsers,
  getGamesForWeek,
  getWeekPicksForCompare,
} from "@/lib/queries";
import { displayTeamName } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Short label for a pick, e.g. "RUTG 15-21" or "ND 8-14".
 *
 * Initials only works for multi-word names -- "Rutgers" collapsed to "R",
 * which is useless in a column of them. Single-word names take their first
 * four letters instead. The cell carries the full name as a title either
 * way.
 */
function pickLabel(teamName: string, bucket: number): string {
  const words = teamName.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  const abbrev =
    words.length > 1
      ? words.map((w) => w[0]).join("").slice(0, 4).toUpperCase()
      : (words[0] ?? teamName).slice(0, 4).toUpperCase();
  const label = isMarginBucketId(bucket) ? MARGIN_BUCKETS[bucket].label : "?";
  return `${abbrev} ${label}`;
}

export default async function ComparePage({
  searchParams,
}: PageProps<"/compare">) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;

  const weekParam = Number(params.week);
  const week =
    isValidWeek(weekParam) && weekParam !== 16 ? weekParam : REGULAR_SEASON_WEEKS[0];

  const [teams, games, picks, allUsers] = await Promise.all([
    getAllTeams(),
    getGamesForWeek(week, userId),
    getWeekPicksForCompare(week),
    getCompareUsers(),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Who to show. Defaults to you plus the next person, rather than the whole
  // pool -- ten columns of abbreviations is a wall, and the point is to
  // compare against someone in particular.
  const raw = params.who;
  const requested = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map(Number)
    .filter((n) => allUsers.some((u) => u.userId === n));
  const selected =
    requested.length > 0
      ? requested
      : [userId, allUsers.find((u) => u.userId !== userId)?.userId].filter(
          (n): n is number => typeof n === "number",
        );

  const shown = allUsers.filter((u) => selected.includes(u.userId));
  const pickFor = new Map<string, (typeof picks)[number]>();
  for (const p of picks) pickFor.set(`${p.userId}:${p.gameId}`, p);

  // Consensus counts the WHOLE pool, not just the selected columns -- "8 of
  // 9 took Oregon" is only meaningful against everyone who picked it.
  const consensus = new Map<number, Map<number, number>>();
  for (const p of picks) {
    if (!consensus.has(p.gameId)) consensus.set(p.gameId, new Map());
    const byTeam = consensus.get(p.gameId)!;
    byTeam.set(p.winnerTeamId, (byTeam.get(p.winnerTeamId) ?? 0) + 1);
  }

  // Head-to-head only reads as a comparison with exactly two columns.
  let agreement: { same: number; both: number } | null = null;
  if (shown.length === 2) {
    let same = 0;
    let both = 0;
    for (const game of games) {
      const a = pickFor.get(`${shown[0].userId}:${game.id}`);
      const b = pickFor.get(`${shown[1].userId}:${game.id}`);
      if (!a || !b) continue;
      both++;
      if (a.winnerTeamId === b.winnerTeamId) same++;
    }
    agreement = { same, both };
  }

  const linkFor = (targetWeek: number) => {
    const q = new URLSearchParams();
    q.set("week", String(targetWeek));
    for (const id of selected) q.append("who", String(id));
    return `/compare?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          Compare Picks
          <Tooltip text="Everyone's picks for one week, side by side. Choose who to show -- two people gives you a head-to-head agreement rate. The consensus column counts the whole pool, not just the columns you picked, so it means the same thing however you filter. Conference championship week isn't here: those matchups are derived per person, so two people's title games are different games entirely." />
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pick a week and who to compare. Blank cells are games that person
          didn&apos;t pick.
        </p>
      </div>

      {/* Week picker */}
      <div className="flex flex-wrap gap-1.5">
        {REGULAR_SEASON_WEEKS.map((w) => (
          <Link
            key={w}
            href={linkFor(w)}
            className={`rounded border px-2 py-1 text-xs ${
              w === week
                ? "border-accent bg-accent/15 font-semibold text-accent-strong"
                : "border-line-strong text-ink-soft hover:border-accent hover:text-accent-strong"
            }`}
          >
            {getWeekLabel(w).replace("Week ", "W")}
          </Link>
        ))}
      </div>

      {/* Who to compare. A GET form so the whole thing stays server-rendered
          and the selection lives in a shareable URL. */}
      <form method="get" className="rounded-lg border border-line bg-surface p-3">
        <input type="hidden" name="week" value={week} />
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Show these people
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {allUsers.map((u) => (
            <label key={u.userId} className="flex items-center gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                name="who"
                value={u.userId}
                defaultChecked={selected.includes(u.userId)}
                className="h-4 w-4"
              />
              {u.displayName}
              {u.userId === userId && (
                <span className="text-xs text-ink-muted">(you)</span>
              )}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="mt-3 rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong"
        >
          Update
        </button>
      </form>

      {agreement && (
        <p className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink-soft">
          <span className="font-bold text-ink">
            {shown[0].displayName} and {shown[1].displayName}
          </span>{" "}
          agree on{" "}
          <span className="font-bold text-ink">
            {agreement.same} of {agreement.both}
          </span>{" "}
          games they both picked
          {agreement.both > 0 && (
            <> ({Math.round((agreement.same / agreement.both) * 100)}%)</>
          )}
          .
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-ink-muted">Choose at least one person above.</p>
      ) : games.length === 0 ? (
        <p className="text-ink-muted">No games seeded for this week yet.</p>
      ) : (
        /* The one place a horizontal scroll is right: with several people
           selected this genuinely is a wide table, and squeezing it would
           make every cell unreadable. It scrolls inside its own box, so the
           page itself never moves sideways. */
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-ink-muted">
              <tr>
                <th className="px-2 py-2 text-left sm:px-3">Game</th>
                <th className="px-2 py-2 text-left sm:px-3">Consensus</th>
                {shown.map((u) => (
                  <th
                    key={u.userId}
                    className="whitespace-nowrap px-2 py-2 text-left sm:px-3"
                  >
                    {u.displayName}
                    {u.userId === userId && " (you)"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const t1 = teamById.get(game.team1Id);
                const t2 = teamById.get(game.team2Id);
                const counts = consensus.get(game.id) ?? new Map();
                const c1 = counts.get(game.team1Id) ?? 0;
                const c2 = counts.get(game.team2Id) ?? 0;
                const total = c1 + c2;
                const leaderId =
                  c1 === c2 ? null : c1 > c2 ? game.team1Id : game.team2Id;
                const leaderTeam = leaderId === null ? null : teamById.get(leaderId);
                const lead = Math.max(c1, c2);
                return (
                  <tr key={game.id} className="border-t border-line bg-surface">
                    <td className="px-2 py-2 sm:px-3">
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-ink">
                        <TeamLogo logoUrl={t1?.logoUrl} name={displayTeamName(t1)} size={16} />
                        <span className="text-xs">{displayTeamName(t1)}</span>
                        <span className="text-[10px] text-ink-muted">vs</span>
                        <TeamLogo logoUrl={t2?.logoUrl} name={displayTeamName(t2)} size={16} />
                        <span className="text-xs">{displayTeamName(t2)}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-ink-soft sm:px-3">
                      {total === 0 ? (
                        <span className="text-ink-muted">nobody yet</span>
                      ) : leaderId === null ? (
                        <span className="text-ink-muted">
                          split {c1}-{c2}
                        </span>
                      ) : (
                        <>
                          {lead} of {total} took{" "}
                          <span className="font-semibold text-ink">
                            {displayTeamName(leaderTeam ?? undefined)}
                          </span>
                        </>
                      )}
                    </td>
                    {shown.map((u) => {
                      const p = pickFor.get(`${u.userId}:${game.id}`);
                      if (!p) {
                        return (
                          <td
                            key={u.userId}
                            className="px-2 py-2 text-xs text-ink-muted sm:px-3"
                          >
                            —
                          </td>
                        );
                      }
                      const team = teamById.get(p.winnerTeamId);
                      // Against the crowd is the interesting case, so it is
                      // the one that gets colour.
                      const withCrowd =
                        leaderId !== null && leaderId === p.winnerTeamId;
                      return (
                        <td
                          key={u.userId}
                          className={`whitespace-nowrap px-2 py-2 text-xs sm:px-3 ${
                            withCrowd ? "text-ink" : "font-semibold text-accent-strong"
                          }`}
                          title={`${displayTeamName(team)} by ${
                            isMarginBucketId(p.marginBucket)
                              ? MARGIN_BUCKETS[p.marginBucket].label
                              : "?"
                          }`}
                        >
                          {pickLabel(displayTeamName(team), p.marginBucket)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
