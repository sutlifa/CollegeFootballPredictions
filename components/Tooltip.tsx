type TooltipProps = {
  text: string;
};

// Pure CSS (group-hover / group-focus-within) -- no client JS needed, works
// the same in a Server Component. tabIndex + focus-within covers keyboard
// and touch users who can't hover.
export function Tooltip({ text }: TooltipProps) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line-strong text-[10px] leading-none font-bold text-ink-muted hover:border-accent hover:text-accent-strong focus:border-accent focus:text-accent-strong focus:outline-none"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs leading-snug font-normal normal-case text-ink-soft opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
