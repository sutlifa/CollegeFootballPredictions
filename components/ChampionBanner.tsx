import { TeamLogo } from "./TeamLogo";
import { TrophyIcon } from "./TrophyIcon";
import type { Seed } from "@/lib/bracket";
import type { Team } from "@/lib/types";

/**
 * Accepts "#BB0000", "BB0000" or "#b00" and returns "#bb0000". Returns null
 * for anything else -- CFBD fills these in for every FBS team, but the
 * non-FBS opponents created from a schedule have no colours at all, and a
 * half-parsed hex would render as a black box rather than fall back.
 */
function normalizeHex(raw: string | null): string | null {
  if (!raw) return null;
  const hex = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/**
 * The champion's colours are whatever the school actually uses, which
 * includes near-white (Penn State's white, Navy's gold) and near-black
 * (Army, Cincinnati). Neither can be trusted as a text background, so the
 * banner picks ink to match and never assumes the dark-theme default. Teams
 * whose primary is close to the page background get the gold accent
 * instead, so the banner still reads as a banner.
 */
function bannerPalette(team: Team | undefined) {
  const primary = normalizeHex(team?.color ?? null);
  const secondary = normalizeHex(team?.altColor ?? null);
  const base = primary ?? "#d8a53d";
  const lum = luminance(base);
  return {
    base,
    // Sits behind the name; on a very light primary the ink flips to near
    // black so the school name does not disappear into its own colour.
    ink: lum > 0.45 ? "#171310" : "#ffffff",
    inkSoft: lum > 0.45 ? "rgba(23,19,16,0.72)" : "rgba(255,255,255,0.78)",
    // Only used for the thin accent rule; falls back to gold when a school's
    // secondary is so close to its primary that the rule would vanish.
    accent:
      secondary && Math.abs(luminance(secondary) - lum) > 0.12
        ? secondary
        : "#eec25f",
  };
}

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
  const { base, ink, inkSoft, accent } = bannerPalette(team);
  const mascot = team?.mascot ?? null;

  return (
    <section
      aria-label={`${champion.team} ${mascot ?? ""} national champion`.trim()}
      className="champion-banner relative overflow-hidden rounded-2xl border-2 px-5 py-8 text-center sm:px-10 sm:py-10"
      style={{
        borderColor: accent,
        // Team colour, lifted at the top so the logo plate has something to
        // sit against and darkened at the base so the seed line stays legible.
        backgroundImage: `radial-gradient(120% 140% at 50% -20%, ${base} 0%, ${base} 45%, rgba(0,0,0,0.55) 100%)`,
        color: ink,
      }}
    >
      {/* Rays, purely decorative, kept faint so the name always wins. */}
      <div
        aria-hidden
        className="champion-rays pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage: `repeating-conic-gradient(from 0deg at 50% 0%, ${accent} 0deg 4deg, transparent 4deg 16deg)`,
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
