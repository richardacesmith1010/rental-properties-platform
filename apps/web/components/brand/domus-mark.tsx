interface DomusMarkProps {
  size?: number;
  tile?: boolean;
  className?: string;
}

export function DomusMark({ size = 40, tile = true, className = "" }: DomusMarkProps) {
  const strokeWidth = size <= 28 ? 12 : size <= 40 ? 9 : 7;
  const doorway = (
    <svg aria-hidden="true" viewBox="0 0 110 110" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="round" className={tile ? undefined : className}
      width={tile ? "62%" : size} height={tile ? "62%" : size}>
      <path d="M33 92 V50 A22 22 0 0 1 77 50 V92" />
      <path d="M20 92 H90" />
    </svg>
  );

  if (!tile) return doorway;

  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-[22%]
    bg-[var(--action)] text-[var(--action-contrast)] ${className}`}
    style={{ width: size, height: size }}>{doorway}</span>;
}

export function DomusWordmark({ size = 40 }: { size?: number }) {
  return <span data-testid="domus-wordmark" className="inline-flex items-center gap-3 text-[var(--ink)]">
    <DomusMark size={size} />
    <span className={`${size === 40 ? "text-[24px]" : "text-xl"} font-display font-semibold`}>Domus</span>
  </span>;
}
