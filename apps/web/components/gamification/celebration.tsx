"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { DomMascot } from "./dom-mascot";

export function triggerConfetti() {
  const bursts = [
    { particleCount: 120, spread: 72, startVelocity: 34, delay: 0 },
    { particleCount: 90, spread: 62, startVelocity: 28, delay: 200 },
    { particleCount: 90, spread: 78, startVelocity: 30, delay: 400 },
  ];

  for (const burst of bursts) {
    window.setTimeout(() => {
      void confetti({
        particleCount: burst.particleCount,
        spread: burst.spread,
        startVelocity: burst.startVelocity,
        origin: { y: 0.72 },
        colors: ["#7C3AED", "#10B981", "#F59E0B", "#FFFFFF"],
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
    triggerConfetti();
    toast.success("Achievement unlocked", {
      description: message,
      duration: 4200,
      icon: <DomMascot size="sm" label="Dom" mood="celebrating" animate className="shrink-0" />,
    });

    const timer = window.setTimeout(() => onDone?.(), 4200);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  return null;
}
