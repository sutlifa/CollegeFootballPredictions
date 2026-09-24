/**
 * Colours for the champion banner (components/ChampionBanner.tsx), worked
 * out from a school's own primary and secondary.
 *
 * Pure colour maths with no React in it, so it lives in lib/ and can be
 * checked against every real team from a script -- which is how the
 * choices below were verified rather than eyeballed.
 *
 * Team colours cannot be trusted as a text background. Primaries run from
 * near-black (#231f20) through navy (#001e44) to gold (#ffc72c) and white,
 * and every rule here exists because a real school broke the simpler one
 * before it.
 */

/** The app's page background (--color-field in app/globals.css). */
export const PAGE_BACKGROUND = "#0b1f14";
/** The app's gold accent (--color-accent / --color-accent-strong). */
const GOLD = "#d8a53d";
const GOLD_BRIGHT = "#eec25f";
const DARK_INK = "#171310"; // warm near-black, matching the app's ink tokens
const LIGHT_INK = "#ffffff";

/** WCAG 2.x minimums: 4.5:1 for body text, 3:1 for large text and UI edges. */
const TEXT_CONTRAST = 4.5;
const LARGE_CONTRAST = 3;
/**
 * How far the banner body must stand off the page. There is no WCAG figure
 * for "a panel is visibly a panel"; 1.5:1 is where a navy or near-black
 * body stopped reading as a hole in the page when compared side by side.
 * Penn State's #001e44 sits at 1.04:1 raw, which is the case this exists for.
 */
const PAGE_SEPARATION = 1.5;

/**
 * Accepts "#BB0000", "BB0000" or "#b00" and returns "#bb0000". Returns null
 * for anything else -- CFBD fills these in for every FBS team, but the
 * non-FBS opponents created from a schedule have no colours at all, and a
 * half-parsed hex would render as a black box rather than fall back.
 */
export function normalizeHex(raw: string | null): string | null {
  if (!raw) return null;
  const hex = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
}

function channels(hex: string): [number, number, number] {
  return [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `from` moved `t` (0-1) of the way towards `to`, in plain sRGB. */
function mix(from: string, to: string, t: number): string {
  const a = channels(from);
  const b = channels(to);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [
    number,
    number,
    number,
  ]);
}

export type BannerPalette = {
  /** Body colour: the school's primary, lifted if it would vanish into the page. */
  base: string;
  /** Where the body gradient ends -- pushed AWAY from the ink, never towards it. */
  shade: string;
  /** School name. */
  ink: string;
  /** Small label and seed line; opaque, and at least 4.5:1 on every surface. */
  inkSoft: string;
  /** Rules, logo ring, border and the mascot line; at least 3:1 on every surface. */
  accent: string;
  /** The decorative sunburst: a colour and the opacity it is painted at. */
  rays: { color: string; opacity: number };
};

/**
 * Every colour a line of text on the banner can actually sit on.
 *
 * The body is a gradient from `base` to `shade`, and the rays are a
 * translucent colour painted over the WHOLE of it, rotating, so every line
 * of text crosses a ray sooner or later. Checking text against `base` alone
 * is how the rays came to drop the seed line to 2.75:1 on Buffalo. The
 * gradient and the ray blend are both per-channel straight-line mixes in
 * one direction, so luminance moves monotonically along them and checking
 * these four end points covers every point in between.
 */
function surfaces(
  base: string,
  shade: string,
  rays?: { color: string; opacity: number },
): string[] {
  const ends = [base, shade];
  if (!rays || rays.opacity === 0) return ends;
  return [...ends, ...ends.map((c) => mix(c, rays.color, rays.opacity))];
}

const holds = (text: string, on: string[], min: number) =>
  on.every((surface) => contrast(text, surface) >= min);

export function bannerPalette(
  color: string | null,
  altColor: string | null,
): BannerPalette {
  const primary = normalizeHex(color);
  const secondary = normalizeHex(altColor);
  let base = primary ?? GOLD;

  // A primary too close to the page background (44 of the 138 FBS schools
  // on current data: navies, near-blacks, dark greens) left the body as low
  // as 1.04:1 against the page, so only the border said where the banner
  // was. Lift it towards white in small steps until it separates. It stays
  // recognisably the school's colour -- Penn State reads as a lighter navy,
  // not as gold -- which is why this lifts rather than swapping in the
  // app's gold, as an earlier comment here promised but the code never did.
  // The shade and rays below are then held to the same floor, so the
  // separation is true at every point of the banner, not just the top.
  for (
    let t = 0.05;
    contrast(base, PAGE_BACKGROUND) < PAGE_SEPARATION && t <= 0.5;
    t += 0.05
  ) {
    base = mix(primary ?? GOLD, "#ffffff", t);
  }

  // Ink is whichever of near-black or white has the higher contrast against
  // the body -- the actual WCAG comparison, not a luminance cutoff. The old
  // rule flipped to dark ink only above luminance 0.45, but the real
  // crossover is about 0.18, so mid-tones (North Carolina's light blue,
  // Tennessee's orange, UTEP, Georgia Tech, Miami, Marshall) got white text
  // at 2.35-2.87:1, below even the large-text minimum.
  //
  // Pure black vs white always has a winner of at least 4.58:1, but the
  // house near-black is a touch lighter than black. On the worst mid-tone
  // (Oregon State's #dc4405) white edges near-black at 4.31:1 to 4.28:1 and
  // both fail, while true black reaches 4.87:1. So when the preferred pair
  // cannot clear 4.5:1, true black joins the comparison -- a warmer black
  // everywhere else is worth keeping, a failed contrast check is not.
  const byContrast = (a: string, b: string) =>
    contrast(b, base) - contrast(a, base);
  let ink = [DARK_INK, LIGHT_INK].sort(byContrast)[0];
  if (contrast(ink, base) < TEXT_CONTRAST) {
    ink = [DARK_INK, LIGHT_INK, "#000000"].sort(byContrast)[0];
  }
  // Whichever of black and white moves a colour AWAY from the ink. Mixing
  // a surface towards it can only raise the ink's contrast on it.
  const away = ink === LIGHT_INK ? "#000000" : "#ffffff";

  // The gradient's end colour. It used to fade to translucent black, which
  // was right for white ink and exactly wrong for dark ink on gold; it now
  // always shades away from the ink. How far is capped by the page: under
  // white ink "away" is darker, which is towards the page, and a full-depth
  // shade took 113 of 138 banners back down to 1.06-1.41:1 against it at
  // the bottom (Penn State: body #264060, bottom #152335). So only depths
  // that stay on the separation floor are candidates, deepest first, down
  // to a flat body (depth 0) for the darkest schools, whose base is already
  // sitting on that floor. Lightening under dark ink tops out shallower
  // (0.3): a light gradient washes out faster than a dark one.
  const maxDepth = ink === LIGHT_INK ? 0.45 : 0.3;
  const shades = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0]
    .map((f) => mix(base, away, maxDepth * f))
    .filter((c) => contrast(c, PAGE_BACKGROUND) >= PAGE_SEPARATION);
  if (shades.length === 0) shades.push(base);

  // Softened ink for the small text, as an OPAQUE blend rather than an
  // rgba: transparency made the real contrast depend on whatever sat
  // underneath. Small text needs the full 4.5:1, so if softening would
  // drop below it the plain ink is used instead.
  const softened = mix(ink, base, 0.22);

  // The rays. They were accent stripes at a fixed 25% over everything, and
  // since they rotate, every line crosses one: on a ray the small text fell
  // below 4.5:1 for 97 of 138 teams and the mascot -- set in that same
  // accent -- below 3:1 for 32. They are the fanfare the banner was asked
  // for, so rather than dropping them they are chosen, per school, as the
  // strongest version that keeps EVERY line of text passing on a ray and
  // every point of the body clear of the page. The search, in order of
  // preference:
  //   - the deepest gradient first, then shallower ones -- a ray darkens
  //     or lightens the body too, so a gradient already sitting on the
  //     page floor can leave no room for one (Ohio State, UCLA, Nevada and
  //     Virginia Tech had none until the gradient gave a little back);
  //   - within a gradient, softened small text before full-strength ink;
  //   - the school's accent as the ray colour, at the highest opacity that
  //     passes, then a stripe shaded away from the ink;
  //   - and only if nothing at all passes, no rays. A sunburst is
  //     decoration; the contrast is not.
  const opacities = [0.25, 0.2, 0.15, 0.1, 0.06];
  const palettes = shades.map((shade) => {
    const body = surfaces(base, shade);
    // The mascot is set in this colour at 24-36px semibold, so it is text,
    // and large text needs 3:1. The school's secondary is first choice;
    // the app's gold stands in when the secondary is too close to the
    // primary (or missing); and when neither reaches 3:1 -- a gold school
    // whose secondary is also light -- the ink itself, which always does.
    const accent =
      [secondary, GOLD_BRIGHT].find(
        (c): c is string => c !== null && holds(c, body, LARGE_CONTRAST),
      ) ?? ink;
    const softOptions = holds(softened, body, TEXT_CONTRAST)
      ? [softened, ink]
      : [ink];
    const rayOptions = [accent, away].flatMap((color) =>
      opacities.map((opacity) => ({ color, opacity })),
    );
    for (const inkSoft of softOptions) {
      const rays = rayOptions.find((r) => {
        const on = surfaces(base, shade, r);
        return (
          holds(ink, on, TEXT_CONTRAST) &&
          holds(inkSoft, on, TEXT_CONTRAST) &&
          holds(accent, on, LARGE_CONTRAST) &&
          holds(PAGE_BACKGROUND, on, PAGE_SEPARATION)
        );
      });
      if (rays) return { base, shade, ink, inkSoft, accent, rays };
    }
    return {
      base,
      shade,
      ink,
      inkSoft: softOptions[0],
      accent,
      rays: { color: accent, opacity: 0 },
    };
  });
  return palettes.find((p) => p.rays.opacity > 0) ?? palettes[0];
}
