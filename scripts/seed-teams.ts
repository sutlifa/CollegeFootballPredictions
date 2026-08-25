// Run any time CFBD's FBS roster, conference alignment, or the preseason
// poll changes (re-running is always safe):
//   npm run seed:teams
//
// Pulls the current FBS roster (name, conference, logo) and the season's
// real preseason Top 25 (AP poll) directly from CFBD -- this *is* the
// source of truth now, not a static list matched against it, so conference
// realignment (e.g. a team moving conferences) or a program's FBS
// transition (e.g. a team newly joining FBS) shows up automatically on the
// next run instead of silently going stale.
import { sql } from "../lib/db";
import { fetchFbsTeams, fetchPreseasonRankings, pickLogoUrl } from "../lib/cfbd";
import { normalizeCfbdConference } from "../lib/conferences";

const SEASON = 2026;
const PRESEASON_POLL = "AP Top 25";

async function main() {
  const [fbsTeams, rankingsWeeks] = await Promise.all([
    fetchFbsTeams(SEASON),
    fetchPreseasonRankings(SEASON),
  ]);

  const poll = rankingsWeeks[0]?.polls.find((p) => p.poll === PRESEASON_POLL);
  const preseasonRankByCfbdId = new Map(
    (poll?.ranks ?? []).map((r) => [r.teamId, r.rank]),
  );
  if (!poll) {
    console.log(`Warning: no "${PRESEASON_POLL}" found for ${SEASON} week 1 -- preseason_rank will be left null for everyone.`);
  }

  let upserted = 0;
  const currentFbsIds: number[] = [];
  for (const team of fbsTeams) {
    currentFbsIds.push(team.id);
    await sql`
      INSERT INTO teams (cfbd_team_id, name, conference, preseason_rank, logo_url, is_fbs)
      VALUES (
        ${team.id},
        ${team.school},
        ${normalizeCfbdConference(team.conference)},
        ${preseasonRankByCfbdId.get(team.id) ?? null},
        ${pickLogoUrl(team.logos)},
        TRUE
      )
      ON CONFLICT (cfbd_team_id) DO UPDATE SET
        name = EXCLUDED.name,
        conference = EXCLUDED.conference,
        preseason_rank = EXCLUDED.preseason_rank,
        logo_url = EXCLUDED.logo_url,
        is_fbs = TRUE
    `;
    upserted++;
  }
  console.log(`Upserted ${upserted} current FBS teams for ${SEASON}.`);

  // A team we previously had marked FBS that's no longer in this season's
  // FBS list (e.g. it dropped to FCS) -- demote it rather than leaving
  // stale data. Doesn't touch teams that were always non-FBS (they keep
  // whatever cfbd_team_id/logo they picked up from game ingestion).
  const demoted = await sql<{ name: string }[]>`
    UPDATE teams
    SET is_fbs = FALSE, conference = 'FCS'
    WHERE is_fbs = TRUE AND cfbd_team_id IS NOT NULL AND NOT (cfbd_team_id = ANY(${currentFbsIds}))
    RETURNING name
  `;
  if (demoted.length > 0) {
    console.log(`Demoted ${demoted.length} team(s) no longer in the ${SEASON} FBS list:`);
    demoted.forEach((t) => console.log(`  - ${t.name}`));
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
