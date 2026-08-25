type TrophyIconProps = {
  size?: number;
  className?: string;
};

// An original stylized championship-trophy graphic (cup + football + laurel),
// not a reproduction of any real, trademarked trophy design.
export function TrophyIcon({ size = 96, className }: TrophyIconProps) {
  return (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="trophyGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6da8a" />
          <stop offset="55%" stopColor="#d8a53d" />
          <stop offset="100%" stopColor="#a9781f" />
        </linearGradient>
        <linearGradient id="trophyBall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c98a3a" />
          <stop offset="100%" stopColor="#8a5a1f" />
        </linearGradient>
      </defs>

      {/* base */}
      <rect x="30" y="122" width="60" height="10" rx="2" fill="url(#trophyGold)" />
      <rect x="38" y="112" width="44" height="12" rx="2" fill="url(#trophyGold)" />
      {/* stem */}
      <rect x="54" y="90" width="12" height="24" fill="url(#trophyGold)" />
      {/* cup body */}
      <path
        d="M35 40 H85 C85 68 74 88 60 88 C46 88 35 68 35 40 Z"
        fill="url(#trophyGold)"
      />
      {/* handles */}
      <path
        d="M35 44 C18 44 14 66 30 74"
        stroke="url(#trophyGold)"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M85 44 C102 44 106 66 90 74"
        stroke="url(#trophyGold)"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      {/* cup rim */}
      <rect x="32" y="34" width="56" height="9" rx="4" fill="#eec25f" />
      {/* football rising out of the cup */}
      <ellipse
        cx="60"
        cy="26"
        rx="16"
        ry="22"
        fill="url(#trophyBall)"
        transform="rotate(-18 60 26)"
      />
      <path
        d="M48 26 Q60 8 72 26"
        stroke="#f4f1e6"
        strokeWidth="2"
        fill="none"
        transform="rotate(-18 60 26)"
      />
      <line x1="60" y1="10" x2="60" y2="42" stroke="#f4f1e6" strokeWidth="2" transform="rotate(-18 60 26)" />
      <line x1="54" y1="14" x2="66" y2="14" stroke="#f4f1e6" strokeWidth="1.5" transform="rotate(-18 60 26)" />
      <line x1="52" y1="20" x2="68" y2="20" stroke="#f4f1e6" strokeWidth="1.5" transform="rotate(-18 60 26)" />
      <line x1="52" y1="32" x2="68" y2="32" stroke="#f4f1e6" strokeWidth="1.5" transform="rotate(-18 60 26)" />
      <line x1="54" y1="38" x2="66" y2="38" stroke="#f4f1e6" strokeWidth="1.5" transform="rotate(-18 60 26)" />
    </svg>
  );
}
