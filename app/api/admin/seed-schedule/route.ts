import { NextRequest, NextResponse, after } from "next/server";
import { seedSeasonFromCfbd } from "@/lib/ingest";
import { VALID_WEEKS } from "@/lib/format";

const SEEDABLE_WEEKS = VALID_WEEKS.filter((w) => w !== 16);

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
  const weeks = weekParam ? [Number(weekParam)] : SEEDABLE_WEEKS;

  if (weeks.some((w) => !SEEDABLE_WEEKS.includes(w))) {
    return NextResponse.json(
      { error: `week must be one of: ${SEEDABLE_WEEKS.join(", ")}` },
      { status: 400 },
    );
  }

  // Human is waiting on this request -- respond immediately and keep
  // ingesting in the background (CFBD returns the whole season in one call,
  // so this is fast, but still no reason to block the response on it).
  after(() => runSeed(weeks));

  return NextResponse.json({ accepted: true, weeks }, { status: 202 });
}
