import Link from "next/link";

export const metadata = {
  title: "Privacy",
  description:
    "What College Football Predictions stores, who it is shared with, and how to get it deleted.",
};

/**
 * Written from what this app actually does, not from a template. Every claim
 * below is checkable against the schema in lib/db/schema.sql and the services
 * in lib/: users (Google id, email, name, image), predictions, bracket_picks,
 * week_submissions, email_sends. If any of that changes, this page has to
 * change with it -- a privacy policy that has drifted from the code is worse
 * than none, because it is a confident statement that happens to be false.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-ink-soft">
      <div>
        <h1 className="text-2xl font-bold text-ink">Privacy</h1>
        <p className="mt-2 text-ink-muted">
          Last updated 31 August 2026. This is a personal, non-commercial
          project run by one person. It is written to describe what the app
          genuinely does rather than to cover every eventuality.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">What is stored</h2>
        <p>When you sign in with Google, the app stores:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>your Google account identifier</li>
          <li>your email address</li>
          <li>your display name and profile picture URL, if Google provides them</li>
        </ul>
        <p>
          It does <span className="font-semibold text-ink">not</span> receive or
          store your Google password, contacts, calendar, files, or anything
          else from your account.
        </p>
        <p>As you use the app it also stores:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>your game picks (winner and margin band) and which weeks you have completed</li>
          <li>your playoff bracket selections</li>
          <li>whether you have turned weekly reminder emails off, and a record of which reminders were sent to you</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">What is not collected</h2>
        <p>
          There is no analytics, no advertising, no tracking pixels, and no
          third-party scripts on these pages. Your activity is not profiled and
          nothing is sold or shared for marketing. The only cookie set is the
          one that keeps you signed in.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Who can see your picks</h2>
        <p>
          Other signed-in members of this pool can see your display name, your
          picks once made, and your position on the leaderboard. That is the
          point of a pick&apos;em, but it is worth stating plainly: your picks
          are visible to the group, including before a week locks. The app is
          not open to the public &mdash; every page except this one and the
          about page requires signing in.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Services used</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <span className="font-semibold text-ink">Google</span> &mdash;
            sign-in only. Google sees that you signed in to this app.
          </li>
          <li>
            <span className="font-semibold text-ink">Vercel</span> &mdash;
            hosting. Standard server request logs, held by Vercel.
          </li>
          <li>
            <span className="font-semibold text-ink">Neon</span> &mdash; the
            database, where everything listed above is stored.
          </li>
          <li>
            <span className="font-semibold text-ink">Brevo</span> &mdash; sends
            reminder emails, and therefore receives your name and email address
            when one is sent to you.
          </li>
          <li>
            <span className="font-semibold text-ink">CollegeFootballData.com</span>{" "}
            &mdash; supplies schedules and scores. No personal information is
            sent to them.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Emails</h2>
        <p>
          The only emails sent are weekly reminders that your picks are not in
          yet. There is no newsletter and nothing promotional. Every reminder
          carries an unsubscribe link that works without signing in, and using
          it stops them for good.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Keeping and deleting</h2>
        <p>
          Data is kept while the pool is running so past seasons stay
          comparable. Ask and your account and everything attached to it will
          be deleted &mdash; picks, bracket, email record, the lot. Deleting an
          account removes its predictions, so it cannot be undone.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Contact</h2>
        <p>
          Questions about any of this, or a deletion request, can go through{" "}
          <Link href="/report" className="text-accent-strong hover:underline">
            Report a problem
          </Link>
          , which reaches the person who runs the app directly.
        </p>
      </section>
    </div>
  );
}
