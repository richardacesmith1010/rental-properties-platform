"use client";

import { useEffect, useState } from "react";

const TABBAR_HEIGHT_VAR = "--domus-tabbar-height";

export function useTabbarHeightVar() {
  const [nav, setNav] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!nav) return;

    const updateHeight = () => {
      document.documentElement.style.setProperty(TABBAR_HEIGHT_VAR, `${nav.getBoundingClientRect().height}px`);
    };
    updateHeight();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateHeight);
    observer?.observe(nav);

    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty(TABBAR_HEIGHT_VAR);
    };
  }, [nav]);

  return setNav;
}
