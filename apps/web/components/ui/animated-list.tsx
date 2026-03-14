"use client";

import { Children, type ReactNode } from "react";
import { cn } from "@/lib/format";

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  maxDelay?: number;
  animation?: string;
}

export function AnimatedList({
  children,
  className,
  stagger = 50,
  maxDelay = 500,
  animation = "animate-fade-in-up",
}: AnimatedListProps) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) => {
        if (!child) return null;
        const delay = Math.min(i * stagger, maxDelay);
        return (
          <div
            className={cn("opacity-0", animation)}
            style={{
              animationDelay: `${delay}ms`,
              animationFillMode: "forwards",
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
