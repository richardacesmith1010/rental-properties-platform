import type { CSSProperties, ReactNode } from "react";

export function AnimateOnScroll({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number; }) {
  const style: CSSProperties = { animationDelay: `${delay}ms` };
  return <div className={`motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 ${className}`} style={style}>{children}</div>;
}
