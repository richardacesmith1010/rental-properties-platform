"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  target: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  localeFormat?: boolean;
  className?: string;
}

export function CountUp({
  target,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  localeFormat = true,
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState("0");
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;

      const formatted = decimals > 0 ? current.toFixed(decimals) : Math.floor(current).toString();
      const localed = localeFormat
        ? Number(formatted).toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : formatted;

      setDisplay(localed);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }, [target, duration, decimals, localeFormat]);

  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
