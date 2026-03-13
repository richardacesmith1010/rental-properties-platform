import Image from "next/image";
import { cn } from "@/lib/format";

export interface DomMascotProps {
  size?: "sm" | "md" | "lg" | "xl";
  mood?: "happy" | "excited" | "encouraging" | "celebrating" | "thinking";
  className?: string;
  label?: string;
  animate?: boolean;
  showLabel?: boolean;
}

const sizeMap = {
  sm: { width: 32, height: 48 },
  md: { width: 48, height: 72 },
  lg: { width: 80, height: 120 },
  xl: { width: 120, height: 180 }
} as const;

const moodAnimationMap = {
  happy: "animate-domus-bob",
  excited: "animate-domus-bounce",
  encouraging: "animate-domus-wiggle",
  celebrating: "animate-domus-celebrate",
  thinking: "animate-domus-think"
} as const;

export function DomMascot({
  size = "md",
  mood = "happy",
  className,
  label,
  animate = false,
  showLabel = false
}: DomMascotProps) {
  const { width, height } = sizeMap[size];
  const resolvedLabel = label ?? (showLabel ? "Dom" : null);

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <Image
        src="/images/dom-the-key.png"
        alt="Dom, the Domus mascot"
        width={width}
        height={height}
        className={cn("object-contain", animate ? moodAnimationMap[mood] : undefined)}
        priority={size === "lg" || size === "xl"}
        loading={size === "lg" || size === "xl" ? "eager" : "lazy"}
      />
      {resolvedLabel ? (
        <span className="mt-1 text-xs font-bold text-emerald-600">{resolvedLabel}</span>
      ) : null}
    </div>
  );
}
