// Thin wrapper around the CollegeFootballData.com API -- a free, documented,
// server-friendly API purpose-built for this (unlike ESPN's unofficial
// endpoint, which Akamai blocks for any request coming from cloud/server
// infrastructure, Vercel included -- confirmed from both Node and Edge
// runtimes). Requires a free key from https://collegefootballdata.com/key
// set as CFBD_API_KEY.
const CFBD_BASE = "https://api.collegefootballdata.com";

function authHeaders(): HeadersInit {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error("CFBD_API_KEY is not set");
  }
  return { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
}

export type CfbdGame = {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string;
  completed: boolean;
  neutralSite: boolean;
  homeTeam: string;
  homeId: number;
  homePoints: number | null;
  homeClassification: string | null;
  homeConference: string | null;
  awayTeam: string;
  awayId: number;
  awayPoints: number | null;
  awayClassification: string | null;
  awayConference: string | null;
};

/**
 * Fetches every regular-season game for a year in one call (no `week` filter
 * needed -- keeps this well within the free tier's 1,000 calls/month).
 * Callers filter down to the week(s) they care about.
 */
export async function fetchSeasonGames(year: number): Promise<CfbdGame[]> {
  const params = new URLSearchParams({
    year: String(year),
    seasonType: "regular",
  });
  const res = await fetch(`${CFBD_BASE}/games?${params}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `CFBD games fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json();
}

export type CfbdTeam = {
  id: number;
  school: string;
  alternateNames: string[];
  conference: string | null;
  classification: string | null;
  logos: string[] | null;
};

/**
 * CFBD returns each team's logos as a flat array cycling through sizes
 * (500, 256, 128, 96, 64, 48, 32, 16), each size appearing twice -- a
 * standard mark, then a "logos-dark" variant meant to read on a dark
 * background. Picks a dark-friendly, list-icon-sized one for this app's
 * dark theme, falling back progressively if that exact combination isn't
 * present.
 */
export function pickLogoUrl(logos: string[] | null | undefined): string | null {
  if (!logos || logos.length === 0) return null;
  return (
    logos.find((l) => l.includes("logos-dark") && l.includes("/128/")) ??
    logos.find((l) => l.includes("logos-dark")) ??
    logos[0] ??
    null
  );
}

export async function fetchFbsTeams(year: number): Promise<CfbdTeam[]> {
  const params = new URLSearchParams({ year: String(year) });
  const res = await fetch(`${CFBD_BASE}/teams/fbs?${params}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `CFBD teams fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json();
}

/**
 * Unlike /teams/fbs, this returns every division (FBS/FCS/II/III) in one
 * call -- used to backfill logos for the ~100 non-FBS opponents that show
 * up as an away team on the schedule but aren't part of our curated FBS
 * roster.
 */
export async function fetchAllTeams(year: number): Promise<CfbdTeam[]> {
  const params = new URLSearchParams({ year: String(year) });
  const res = await fetch(`${CFBD_BASE}/teams?${params}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `CFBD teams fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json();
}

/** Any game touching an FBS team (matches what the WeekN sheets covered -- FBS vs FCS included). */
export function isFbsGame(game: CfbdGame): boolean {
  return game.homeClassification === "fbs" || game.awayClassification === "fbs";
}

export type CfbdPollRank = { rank: number; teamId: number; school: string };
export type CfbdPoll = { poll: string; ranks: CfbdPollRank[] };
export type CfbdRankingsWeek = {
  season: number;
  seasonType: string;
  week: number;
  polls: CfbdPoll[];
};

/**
 * CFBD tags the first published Top 25 of the season (before any games are
 * played) as week 1 -- that's the real preseason poll, not something we
 * compute ourselves.
 */
export async function fetchPreseasonRankings(
  year: number,
): Promise<CfbdRankingsWeek[]> {
  const params = new URLSearchParams({
    year: String(year),
    week: "1",
    seasonType: "regular",
  });
  const res = await fetch(`${CFBD_BASE}/rankings?${params}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      `CFBD rankings fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json();
}
