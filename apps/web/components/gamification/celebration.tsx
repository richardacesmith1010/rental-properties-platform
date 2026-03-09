"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { DomMascot } from "./dom-mascot";

export function triggerConfetti() {
  void confetti({
    particleCount: 110,
    spread: 70,
    startVelocity: 32,
    origin: { y: 0.72 },
    colors: ["#7C3AED", "#10B981", "#F59E0B"]
  });
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
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-violet-200 bg-white/95 px-4 py-3 shadow-xl shadow-violet-500/10 backdrop-blur-sm">
      <DomMascot size="sm" showLabel className="shrink-0" />
      <div>
        <p className="text-sm font-semibold text-zinc-900">Celebration</p>
        <p className="text-sm text-zinc-600">{message}</p>
      </div>
    </div>
  );
}
