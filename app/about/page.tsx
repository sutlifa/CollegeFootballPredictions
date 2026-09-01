import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "What College Football Predictions is, how the picks and rankings work, and where the data comes from.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-ink-soft">
      <div>
        <h1 className="text-2xl font-bold text-ink">About</h1>
        <p className="mt-2">
          College Football Predictions is a season-long pick&apos;em for people
          who want to call an entire year of college football, not just the
          games on TV. You predict every FBS game &mdash; who wins and by
          roughly how much &mdash; and the app works out what your season
          actually produces: conference standings, a computer poll, the
          championship matchups your results create, and a 12-team playoff
          field.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">How picking works</h2>
        <p>
          Every game takes one tap. You choose a winner and a margin band
          &mdash; 1&ndash;7, 8&ndash;14, 15&ndash;21, or 22+ &mdash; rather than
          an exact score, because nobody has a real opinion about whether it
          finishes 31&ndash;17 or 34&ndash;20, and everybody has one about
          whether it is close or a rout.
        </p>
        <p>
          A season is nearly 900 games, and most of them are not a decision. So
          the lopsided ones are filled in for you when you open a week, using
          the better-ranked team and a margin drawn from how far apart the two
          sides are. You can change any of them, and the close games are always
          left for you.
        </p>
        <p>
          Picks freeze when a week&apos;s first game kicks off, the way a
          fantasy lineup locks. That rule is enforced on the server, not just
          hidden in the interface.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">
          What the app works out for you
        </h2>
        <p>
          <span className="font-semibold text-ink">Standings</span> are grouped
          by conference with each league&apos;s real published tiebreaker
          procedure applied &mdash; including the three- and four-way
          variants &mdash; and every ordering can explain itself in words.
        </p>
        <p>
          <span className="font-semibold text-ink">Computer Rankings</span> are
          a 0&ndash;100 power score meant to read like a poll ballot rather than
          a win-loss table: strength of schedule, quality wins and bad losses
          all count. Teams start at their preseason position and that starting
          point fades to nothing as real results accumulate, so a finished
          season is decided entirely by what happened on the field.
        </p>
        <p>
          <span className="font-semibold text-ink">
            Conference championships
          </span>{" "}
          are never pulled from a schedule feed. They are derived from your own
          final standings, so the title games are whoever your season put
          there.
        </p>
        <p>
          <span className="font-semibold text-ink">The leaderboard</span> scores
          everyone once real games are played &mdash; correct winners, and how
          many of those you also called the right margin on.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Where data comes from</h2>
        <p>
          Schedules, teams, logos, conference alignment and real final scores
          come from{" "}
          <a
            href="https://collegefootballdata.com"
            className="text-accent-strong hover:underline"
            target="_blank"
            rel="noreferrer noopener"
          >
            CollegeFootballData.com
          </a>
          , refreshed once a day. Everything else &mdash; standings, rankings,
          brackets &mdash; is computed from your own picks, fresh on every page
          load.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Who runs it</h2>
        <p>
          A personal project, built and maintained by Anthony Sutliff. It is
          not affiliated with, endorsed by, or connected to the NCAA, the
          College Football Playoff, ESPN, or any school or conference. Team
          names and logos belong to their respective owners.
        </p>
        <p>
          Found something broken or behaving strangely?{" "}
          <Link href="/report" className="text-accent-strong hover:underline">
            Report a problem
          </Link>
          . How your information is handled is set out in the{" "}
          <Link href="/privacy" className="text-accent-strong hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
