"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  indicatorClassName?: string;
}

export function AnimatedTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
  activeClassName = "text-violet-700 dark:text-violet-300",
  inactiveClassName = "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
  indicatorClassName = "bg-violet-500",
}: AnimatedTabsProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (el) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-1" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            role="tab"
            aria-selected={tab.id === activeTab}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
              tab.id === activeTab ? activeClassName : inactiveClassName
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className={cn(
          "absolute bottom-0 h-0.5 rounded-full transition-all duration-300",
          indicatorClassName
        )}
        style={{
          left: indicator.left,
          width: indicator.width,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}
