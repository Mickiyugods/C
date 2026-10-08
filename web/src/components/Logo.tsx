export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M34 15 A14 14 0 1 0 34 33"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path d="M38 19.5 L42.5 24 L38 28.5 L33.5 24 Z" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-[1.4rem] leading-none font-semibold sm:text-[1.6rem]">curato</span>
    </span>
  );
}
