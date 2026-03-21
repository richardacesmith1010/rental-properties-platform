import Image from "next/image";
import { cn } from "@/lib/format";

export interface DomMascotProps {
  size?: "sm" | "md" | "lg" | "xl";
  mood?:
    | "happy"
    | "excited"
    | "encouraging"
    | "celebrating"
    | "thinking"
    | "waving"
    | "pointing"
    | "sleeping"
    | "working";
  className?: string;
  label?: string;
  animate?: boolean;
  showLabel?: boolean;
}

const sizeMap = {
  sm: { width: 48, height: 32 },
  md: { width: 72, height: 48 },
  lg: { width: 120, height: 80 },
  xl: { width: 180, height: 120 }
} as const;

const moodAnimationMap = {
  happy: "animate-domus-bob",
  excited: "animate-domus-bounce",
  encouraging: "animate-domus-wiggle",
  celebrating: "animate-domus-celebrate",
  thinking: "animate-domus-think",
  waving: "animate-domus-wiggle",
  pointing: "animate-domus-wiggle",
  sleeping: "animate-domus-bob",
  working: "animate-domus-think"
} as const;

const poseMap = {
  happy: "/images/mascot/poses/happy.png",
  excited: "/images/mascot/poses/celebrating.png",
  encouraging: "/images/mascot/poses/waving.png",
  celebrating: "/images/mascot/poses/celebrating.png",
  thinking: "/images/mascot/poses/thinking.png",
  waving: "/images/mascot/poses/waving.png",
  pointing: "/images/mascot/poses/pointing.png",
  sleeping: "/images/mascot/poses/sleeping.png",
  working: "/images/mascot/poses/thinking.png"
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
  const poseSrc = poseMap[mood] ?? poseMap.happy;

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <Image
        src={poseSrc}
        alt="Dom, the Domus mascot"
        width={width}
        height={height}
        sizes={`${width}px`}
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
