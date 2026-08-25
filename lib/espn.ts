// Thin wrapper around ESPN's unofficial, undocumented college football API.
// No auth/key required, but there's no SLA -- wrap all call sites in
// try/catch, cache aggressively, and never call this from a page render.
const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football";

// ESPN's edge appears to 403 requests whose headers look non-browser-like
// (observed specifically from Vercel's serverless IPs, not from a local
// residential connection) -- a plausible bot-detection heuristic rather than
// an IP block, since Vercel doesn't have a small fixed IP range. Sending a
// normal browser User-Agent/Accept resolved it in testing.
const ESPN_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

export type EspnCompetitor = {
  id: string;
  homeAway: "home" | "away";
  team: {
    id: string;
    displayName: string;
    location: string;
    shortDisplayName: string;
  };
  score?: string;
  winner?: boolean;
};

export type EspnEvent = {
  id: string;
  date: string;
  competitions: Array<{
    neutralSite: boolean;
    competitors: EspnCompetitor[];
    status: {
      type: {
        completed: boolean;
        name: string; // e.g. "STATUS_FINAL", "STATUS_SCHEDULED", "STATUS_IN_PROGRESS"
      };
    };
  }>;
};

export type EspnScoreboardResponse = {
  events: EspnEvent[];
};

/**
 * Fetches one week's FBS (groups=80) scoreboard. `dates` is accepted
 * explicitly rather than hardcoded per-week because the exact 2026
 * calendar-date-to-week mapping needs confirming empirically during Week 1
 * ingestion -- see the plan's "open items".
 */
export async function fetchWeekScoreboard(
  week: number,
  opts: { dates?: string; seasontype?: number } = {},
): Promise<EspnScoreboardResponse> {
  const params = new URLSearchParams({
    groups: "80",
    seasontype: String(opts.seasontype ?? 2),
    week: String(week),
  });
  if (opts.dates) params.set("dates", opts.dates);

  const res = await fetch(`${ESPN_BASE}/scoreboard?${params}`, {
    cache: "no-store",
    headers: ESPN_FETCH_HEADERS,
  });
  if (!res.ok) {
    throw new Error(
      `ESPN scoreboard fetch failed: ${res.status} ${res.statusText} for week ${week}`,
    );
  }
  return res.json();
}

export type EspnTeam = {
  id: string;
  displayName: string;
  location: string;
  shortDisplayName: string;
};

export async function fetchAllEspnTeams(): Promise<EspnTeam[]> {
  // groups=80 does NOT scope this endpoint to FBS only (unlike /scoreboard) --
  // it returns FBS/FCS/D2/D3/NAIA teams alike (~750+ as of writing), and the
  // default limit truncates well before that. Ask for a generous ceiling
  // rather than relying on `groups` to filter division here; matching is
  // still safe because we only keep ESPN teams that match one of our own
  // seeded names (see scripts/resolve-espn-team-ids.ts) -- stray non-FBS
  // teams simply won't match anything and are ignored.
  const res = await fetch(`${ESPN_BASE}/teams?groups=80&limit=2000`, {
    cache: "no-store",
    headers: ESPN_FETCH_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`ESPN teams fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const list: EspnTeam[] =
    data?.sports?.[0]?.leagues?.[0]?.teams?.map(
      (t: { team: EspnTeam }) => t.team,
    ) ?? [];
  return list;
}

export function isGameFinal(event: EspnEvent): boolean {
  return event.competitions[0]?.status?.type?.completed === true;
}

export function getCompetitors(event: EspnEvent): {
  home: EspnCompetitor | undefined;
  away: EspnCompetitor | undefined;
} {
  const competitors = event.competitions[0]?.competitors ?? [];
  return {
    home: competitors.find((c) => c.homeAway === "home"),
    away: competitors.find((c) => c.homeAway === "away"),
  };
}
