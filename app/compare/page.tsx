import Link from "next/link";
import { auth } from "@/auth";
import { ComparePeoplePicker } from "@/components/ComparePeoplePicker";
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
 * How many people can be compared at once.
 *
 * A layout constraint rather than a preference: past five columns the table
 * stops fitting and falls back to a horizontal scrollbar that, on a page of
 * ninety rows, sits at the very bottom where nobody finds it. Enforced here
 * as well as in the picker, so a hand-edited URL cannot exceed it.
 */
const MAX_COMPARE = 5;

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
  const selected = (
    requested.length > 0
      ? requested
      : [userId, allUsers.find((u) => u.userId !== userId)?.userId].filter(
          (n): n is number => typeof n === "number",
        )
  ).slice(0, MAX_COMPARE);

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

  // Built once and rendered twice -- as cards on a phone, as a table on
  // anything wider. Two layouts, one set of numbers, so they cannot drift.
  const rows = games.map((game) => {
    const t1 = teamById.get(game.team1Id);
    const t2 = teamById.get(game.team2Id);
    const counts = consensus.get(game.id) ?? new Map<number, number>();
    const c1 = counts.get(game.team1Id) ?? 0;
    const c2 = counts.get(game.team2Id) ?? 0;
    const leaderId = c1 === c2 ? null : c1 > c2 ? game.team1Id : game.team2Id;
    return {
      game,
      t1,
      t2,
      name1: displayTeamName(t1),
      name2: displayTeamName(t2),
      c1,
      c2,
      total: c1 + c2,
      lead: Math.max(c1, c2),
      leaderId,
      leaderTeam: leaderId === null ? null : teamById.get(leaderId),
      cells: shown.map((u) => {
        const p = pickFor.get(`${u.userId}:${game.id}`);
        if (!p) {
          return {
            userId: u.userId,
            displayName: u.displayName,
            label: null as string | null,
            title: undefined as string | undefined,
            withCrowd: false,
          };
        }
        const team = teamById.get(p.winnerTeamId);
        const bucket = isMarginBucketId(p.marginBucket)
          ? MARGIN_BUCKETS[p.marginBucket].label
          : "?";
        return {
          userId: u.userId,
          displayName: u.displayName,
          label: pickLabel(displayTeamName(team), p.marginBucket) as string | null,
          title: `${displayTeamName(team)} by ${bucket}` as string | undefined,
          // Going against the crowd is the interesting case, so it is the
          // one that gets colour.
          withCrowd: leaderId !== null && leaderId === p.winnerTeamId,
        };
      }),
    };
  });

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

      <ComparePeoplePicker
        users={allUsers}
        selected={selected}
        week={week}
        you={userId}
        max={MAX_COMPARE}
      />

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
        <>
          {/* PHONES: one card per game.
              A table was the wrong shape here. The Game column alone is
              wider than a phone, so the pick columns sat entirely offscreen
              -- you scrolled right and lost the matchup you were reading
              about. Stacking each game with its people underneath needs no
              sideways movement at all. */}
          <div className="space-y-2 sm:hidden">
            {rows.map((row) => (
              <div
                key={row.game.id}
                className="rounded-lg border border-line bg-surface px-3 py-2.5"
              >
                <div className="flex items-center gap-1.5 text-sm text-ink">
                  <TeamLogo logoUrl={row.t1?.logoUrl} name={row.name1} size={16} />
                  <span className="min-w-0 truncate">{row.name1}</span>
                  <span className="shrink-0 text-[10px] text-ink-muted">vs</span>
                  <TeamLogo logoUrl={row.t2?.logoUrl} name={row.name2} size={16} />
                  <span className="min-w-0 truncate">{row.name2}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  {row.total === 0 ? (
                    <span className="text-ink-muted">nobody has picked this</span>
                  ) : row.leaderId === null ? (
                    <span className="text-ink-muted">
                      split {row.c1}-{row.c2}
                    </span>
                  ) : (
                    <>
                      {row.lead} of {row.total} took{" "}
                      <span className="font-semibold text-ink">
                        {displayTeamName(row.leaderTeam ?? undefined)}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  {row.cells.map((cell) => (
                    <div
                      key={cell.userId}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 truncate text-ink-muted">
                        {cell.displayName}
                        {cell.userId === userId && " (you)"}
                      </span>
                      <span
                        className={`shrink-0 ${
                          !cell.label
                            ? "text-ink-muted"
                            : cell.withCrowd
                              ? "text-ink"
                              : "font-semibold text-accent-strong"
                        }`}
                      >
                        {cell.label ?? "no pick"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Wider screens: the grid, where columns genuinely read better. */}
          <div className="hidden rounded-lg border border-line sm:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-surface-2 text-ink-muted">
                <tr>
                  <th className="w-[38%] px-3 py-2 text-left">Game</th>
                  {shown.map((u) => (
                    <th
                      key={u.userId}
                      className="px-2 py-2 text-left text-xs font-semibold"
                    >
                      <span className="block truncate" title={u.displayName}>
                        {u.displayName}
                        {u.userId === userId && " (you)"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.game.id} className="border-t border-line bg-surface">
                    {/* Matchup and consensus share one cell. Two wide
                        columns for what is really one piece of context was
                        most of why this table did not fit. */}
                    <td className="px-3 py-2 align-top">
                      <span className="flex min-w-0 items-center gap-1.5 text-ink">
                        <TeamLogo logoUrl={row.t1?.logoUrl} name={row.name1} size={16} />
                        <span className="truncate text-xs">{row.name1}</span>
                        <span className="shrink-0 text-[10px] text-ink-muted">vs</span>
                        <TeamLogo logoUrl={row.t2?.logoUrl} name={row.name2} size={16} />
                        <span className="truncate text-xs">{row.name2}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-muted">
                        {row.total === 0 ? (
                          "nobody has picked this"
                        ) : row.leaderId === null ? (
                          <>
                            split {row.c1}-{row.c2}
                          </>
                        ) : (
                          <>
                            {row.lead}/{row.total} took{" "}
                            <span className="font-semibold text-ink-soft">
                              {displayTeamName(row.leaderTeam ?? undefined)}
                            </span>
                          </>
                        )}
                      </span>
                    </td>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.userId}
                        title={cell.title}
                        className={`px-2 py-2 align-top text-xs ${
                          !cell.label
                            ? "text-ink-muted"
                            : cell.withCrowd
                              ? "text-ink"
                              : "font-semibold text-accent-strong"
                        }`}
                      >
                        <span className="block truncate">{cell.label ?? "—"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
