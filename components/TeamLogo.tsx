type TeamLogoProps = {
  logoUrl: string | null | undefined;
  name: string;
  size?: number;
  /**
   * Load immediately instead of lazily. For the handful of places a logo is
   * the point of the screen rather than a row decoration -- the champion
   * banner -- where lazy loading leaves the largest element on the page
   * blank for a beat after it renders.
   */
  eager?: boolean;
};

// Plain <img>, not next/image: these are small decorative icons from a
// third-party CDN (collegefootballdata.com) -- not worth the remotePatterns
// config or the Vercel image-optimization function invocations for icons
// this size.
export function TeamLogo({ logoUrl, name, size = 24, eager }: TeamLogoProps) {
  if (!logoUrl) {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full bg-surface-3"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      className="inline-block shrink-0 object-contain"
      loading={eager ? "eager" : "lazy"}
      title={name}
    />
  );
}
