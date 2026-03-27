import Image from "next/image";
import { cn } from "@/lib/format";

interface DomusLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  alt?: string;
  priority?: boolean;
}

const sizeToPixels = {
  sm: 28,
  md: 36,
  lg: 44
} as const;

export function DomusLogo({
  size = "md",
  className,
  alt = "Domus",
  priority = false
}: DomusLogoProps) {
  const pixelSize = sizeToPixels[size];

  return (
    <Image
      src="/images/mascot/icons/head.png"
      alt={alt}
      width={pixelSize}
      height={pixelSize}
      className={cn("rounded-xl", className)}
      priority={priority}
    />
  );
}
