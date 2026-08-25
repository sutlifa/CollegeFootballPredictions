import { NextRequest, NextResponse, after } from "next/server";
import { seedWeekFromEspn } from "@/lib/ingest";

export const maxDuration = 60;

async function runSeed(weeks: number[], dates?: string) {
  for (const week of weeks) {
    try {
      const result = await seedWeekFromEspn(week, { dates });
      console.log(`[seed-schedule] week ${week}: ${result.gamesUpserted} games`);
    } catch (err) {
      console.error(`[seed-schedule] week ${week} failed`, err);
    }
  }
}

export async function POST(request: NextRequest) {
  const adminSecret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");
  const datesParam = searchParams.get("dates") ?? undefined;
  const weeks = weekParam
    ? [Number(weekParam)]
    : Array.from({ length: 15 }, (_, i) => i + 1);

  if (weeks.some((w) => Number.isNaN(w) || w < 1 || w > 15)) {
    return NextResponse.json(
      { error: "week must be between 1 and 15" },
      { status: 400 },
    );
  }

  // Human is waiting on this request -- respond immediately and keep
  // ingesting in the background rather than making them wait on 15 sequential
  // ESPN fetches.
  after(() => runSeed(weeks, datesParam));

  return NextResponse.json({ accepted: true, weeks }, { status: 202 });
}
