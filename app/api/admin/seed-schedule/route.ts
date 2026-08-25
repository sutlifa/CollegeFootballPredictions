import { NextRequest, NextResponse, after } from "next/server";
import { seedSeasonFromCfbd } from "@/lib/ingest";

export const maxDuration = 60;

async function runSeed(weeks: number[]) {
  try {
    const results = await seedSeasonFromCfbd(weeks);
    for (const r of results) {
      console.log(`[seed-schedule] week ${r.week}: ${r.gamesUpserted} games`);
    }
  } catch (err) {
    console.error("[seed-schedule] failed", err);
  }
}

export async function POST(request: NextRequest) {
  const adminSecret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");
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
  // ingesting in the background (CFBD returns the whole season in one call,
  // so this is fast, but still no reason to block the response on it).
  after(() => runSeed(weeks));

  return NextResponse.json({ accepted: true, weeks }, { status: 202 });
}
