"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { DomMascot } from "./dom-mascot";

export function triggerConfetti() {
  const bursts = [
    { particleCount: 120, spread: 72, startVelocity: 34, delay: 0 },
    { particleCount: 90, spread: 62, startVelocity: 28, delay: 200 },
    { particleCount: 90, spread: 78, startVelocity: 30, delay: 400 }
  ];

  for (const burst of bursts) {
    window.setTimeout(() => {
      void confetti({
        particleCount: burst.particleCount,
        spread: burst.spread,
        startVelocity: burst.startVelocity,
        origin: { y: 0.72 },
        colors: ["#7C3AED", "#10B981", "#F59E0B", "#FFFFFF"]
      });
    }, burst.delay);
  }
}

interface CelebrationToastProps {
  message: string;
  onDone?: () => void;
}

export function CelebrationToast({ message, onDone }: CelebrationToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone?.(), 4200);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-violet-200 bg-white/95 px-5 py-4 shadow-xl shadow-violet-500/10 backdrop-blur-sm">
      <DomMascot size="sm" label="Dom" mood="celebrating" animate className="shrink-0" />
      <div>
        <p className="text-sm font-semibold text-zinc-900">Achievement unlocked</p>
        <p className="text-sm text-zinc-600">{message}</p>
        <p className="mt-1 text-xs text-zinc-500">XP added and progress updated.</p>
      </div>
    </div>
  );
}
