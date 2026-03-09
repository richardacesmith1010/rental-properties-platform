import Image from "next/image";
import { cn } from "@/lib/format";

export interface DomMascotProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showLabel?: boolean;
}

const sizeMap = {
  sm: { width: 32, height: 48 },
  md: { width: 48, height: 72 },
  lg: { width: 80, height: 120 },
  xl: { width: 120, height: 180 }
} as const;

export function DomMascot({ size = "md", className, showLabel = false }: DomMascotProps) {
  const { width, height } = sizeMap[size];

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <Image
        src="/images/dom-the-key.png"
        alt="Dom the Key mascot"
        width={width}
        height={height}
        className="object-contain"
        priority={size === "lg" || size === "xl"}
      />
      {showLabel ? (
        <span className="mt-1 text-xs font-bold text-emerald-600">Dom</span>
      ) : null}
    </div>
  );
}
