import { TeamLogo } from "./TeamLogo";
import { TrophyIcon } from "./TrophyIcon";
import { bannerPalette } from "@/lib/bannerPalette";
import type { Seed } from "@/lib/bracket";
import type { Team } from "@/lib/types";

type Props = {
  champion: Seed;
  team: Team | undefined;
  season: number;
};

/**
 * The payoff for filling in all eleven games: the school, its mascot and
 * its mark, at a size nothing else on the page competes with, in that
 * school's own colours.
 *
 * Rendered only once every slot has a pick (the page decides), so it
 * doubles as the signal that the bracket is finished -- there is no other
 * "you're done" state.
 */
export function ChampionBanner({ champion, team, season }: Props) {
  // Every colour decision (ink, softened ink, accent, the lift for dark
  // primaries, the gradient's depth, the rays) is made in
  // lib/bannerPalette.ts by WCAG contrast, and was checked against the real
  // colours of all 138 FBS schools, on and off a ray -- read that file
  // before changing any colour here.
  const { base, shade, ink, inkSoft, accent, rays } = bannerPalette(
    team?.color ?? null,
    team?.altColor ?? null,
  );
  const mascot = team?.mascot ?? null;

  return (
    <section
      aria-label={`${champion.team} ${mascot ?? ""} national champion`.trim()}
      className="champion-banner relative overflow-hidden rounded-2xl border-2 px-5 py-8 text-center sm:px-10 sm:py-10"
      style={{
        borderColor: accent,
        // Solid team colour under the gradient, and a gradient between two
        // OPAQUE colours. It used to fade to rgba(0,0,0,0.55), which let the
        // page show through at the bottom and made the seed line's real
        // contrast depend on what was behind the banner. `shade` moves away
        // from the ink (darker under white ink, lighter under dark ink), and
        // only as far as keeps the bottom of the banner clear of the page.
        backgroundColor: base,
        backgroundImage: `radial-gradient(120% 140% at 50% -20%, ${base} 0%, ${base} 45%, ${shade} 100%)`,
        color: ink,
      }}
    >
      {/* Rays, purely decorative. Their colour AND opacity come from
          bannerPalette, never a fixed class: they rotate, so every line of
          text crosses one, and at a flat 25% of the accent they dropped the
          seed line and mascot below WCAG for most schools. The palette picks
          the strongest ray that keeps all the text passing on top of it. */}
      <div
        aria-hidden
        className="champion-rays pointer-events-none absolute inset-0"
        style={{
          opacity: rays.opacity,
          backgroundImage: `repeating-conic-gradient(from 0deg at 50% 0%, ${rays.color} 0deg 4deg, transparent 4deg 16deg)`,
        }}
      />

      <div className="relative flex flex-col items-center gap-3">
        <p
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: inkSoft }}
        >
          <span
            className="h-px w-6 sm:w-10"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          {season} National Champion
          <span
            className="h-px w-6 sm:w-10"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
        </p>

        {/* The plate is DARK, and must stay dark. pickLogoUrl stores the
            "logos-dark" variant, which is the artwork drawn FOR dark
            backgrounds -- Ohio State's, for instance, sets the wordmark in
            white. Checked against a cream plate side by side: every mark
            still reads on dark, while the white wordmarks all but vanish on
            cream. Dark also matches the logo treatment everywhere else.

            Loaded eagerly: it is the largest thing on the page and the
            reason the banner exists, so the default lazy behaviour left it
            visibly blank on arrival. */}
        <div
          className="champion-logo flex h-28 w-28 items-center justify-center rounded-full border-4 bg-[#0b1f14] shadow-2xl sm:h-36 sm:w-36"
          style={{ borderColor: accent }}
        >
          <TeamLogo
            logoUrl={team?.logoUrl ?? null}
            name={champion.team}
            size={84}
            eager
          />
        </div>

        <div>
          <h1 className="text-4xl font-black leading-none tracking-tight sm:text-6xl">
            {champion.team}
          </h1>
          {mascot && (
            <p
              className="mt-1 text-2xl font-semibold tracking-wide sm:text-4xl"
              style={{ color: accent }}
            >
              {mascot}
            </p>
          )}
        </div>

        <p
          className="text-sm font-medium sm:text-base"
          style={{ color: inkSoft }}
        >
          No. {champion.seed} seed &middot; {champion.wins}-{champion.losses}{" "}
          &middot; {champion.conference}
        </p>

        <TrophyIcon size={64} className="champion-trophy mt-1" />
      </div>
    </section>
  );
}
