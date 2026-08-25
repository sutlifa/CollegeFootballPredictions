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
        <h1 className="text-2xl font-semibold">2026 Season</h1>
        <p className="mt-1 text-neutral-400">
          Predict every game, week by week, and see the resulting standings,
          computer rankings, and playoff picture.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {weeks.map(({ week, total, decided }) => (
          <Link
            key={week}
            href={`/weeks/${week}`}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <div className="text-lg font-medium">
              {week === 16 ? "Championship Week" : `Week ${week}`}
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              {total === 0
                ? week <= 15
                  ? "Not seeded yet"
                  : "Awaiting conference standings"
                : `${decided} / ${total} predicted`}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
