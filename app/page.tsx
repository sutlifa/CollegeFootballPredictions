import Link from "next/link";
import { getAllGames } from "@/lib/queries";
import { isDecided } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const games = await getAllGames();

  const weeks = Array.from({ length: 16 }, (_, i) => i + 1).map((week) => {
    const weekGames = games.filter((g) => g.week === week);
    const decided = weekGames.filter(isDecided).length;
    return { week, total: weekGames.length, decided };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">2026 Season</h1>
        <p className="mt-1 text-ink-muted">
          Predict every game, week by week, and see the resulting standings,
          computer rankings, and playoff picture.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {weeks.map(({ week, total, decided }) => {
          const pct = total > 0 ? Math.round((decided / total) * 100) : 0;
          return (
            <Link
              key={week}
              href={`/weeks/${week}`}
              className="group rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
            >
              <div className="text-lg font-semibold text-ink group-hover:text-accent-strong">
                {week === 16 ? "Championship Week" : `Week ${week}`}
              </div>
              <div className="mt-1 text-sm text-ink-muted">
                {total === 0
                  ? week <= 15
                    ? "Not seeded yet"
                    : "Awaiting conference standings"
                  : `${decided} / ${total} predicted`}
              </div>
              {total > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
