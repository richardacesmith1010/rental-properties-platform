import { cn } from "@/lib/format";

export interface DomMascotProps {
  expression?: "happy" | "excited" | "cool" | "thinking" | "concerned";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: { width: 32, height: 48 },
  md: { width: 48, height: 72 },
  lg: { width: 80, height: 120 },
  xl: { width: 120, height: 180 }
} as const;

function StarPupil({ cx, cy }: { cx: number; cy: number }) {
  return (
    <path
      d={`M ${cx} ${cy - 5} L ${cx + 1.8} ${cy - 1.8} L ${cx + 5} ${cy} L ${cx + 1.8} ${cy + 1.8} L ${cx} ${cy + 5} L ${cx - 1.8} ${cy + 1.8} L ${cx - 5} ${cy} L ${cx - 1.8} ${cy - 1.8} Z`}
      fill="#F59E0B"
    />
  );
}

export function DomMascot({ expression = "happy", size = "md", className }: DomMascotProps) {
  const { width, height } = sizeMap[size];
  const pupilColor = expression === "excited" ? "#F59E0B" : "#10B981";

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 180"
      className={cn("text-violet-600", className)}
      role="img"
      aria-label={`Dom the Key mascot (${expression})`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {expression === "excited" && (
        <g stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" opacity="0.9">
          <path d="M18 22L28 28" />
          <path d="M102 22L92 28" />
          <path d="M12 46H24" />
          <path d="M96 46H108" />
        </g>
      )}

      <g fill="currentColor">
        <circle cx="60" cy="42" r="32" />
        <rect x="52" y="70" width="16" height="70" rx="8" />
        <rect x="40" y="128" width="48" height="14" rx="6" />
        <rect x="40" y="128" width="12" height="30" rx="5" />
        <rect x="58" y="128" width="12" height="38" rx="5" />
        <rect x="76" y="128" width="12" height="22" rx="5" />
      </g>

      <circle cx="60" cy="42" r="15" fill="white" opacity="0.98" />

      {expression === "cool" ? (
        <g>
          <rect x="36" y="28" width="48" height="18" rx="8" fill="#111827" opacity="0.92" />
          <path d="M56 37H64" stroke="#374151" strokeWidth="4" strokeLinecap="round" />
          <path d="M48 60C52 64 68 64 72 60" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <circle cx="48" cy="35" r="9.5" fill="white" />
          <circle cx="72" cy="35" r="9.5" fill="white" />

          {expression === "excited" ? (
            <>
              <StarPupil cx={48} cy={35} />
              <StarPupil cx={72} cy={35} />
            </>
          ) : expression === "thinking" ? (
            <>
              <circle cx="51" cy="32" r="4.5" fill={pupilColor} />
              <circle cx="74" cy="31" r="5.2" fill={pupilColor} />
              <path d="M41 23C45 21 50 21 54 23" stroke="#4C1D95" strokeWidth="3.5" strokeLinecap="round" />
            </>
          ) : expression === "concerned" ? (
            <>
              <circle cx="45" cy="39" r="4.5" fill={pupilColor} />
              <circle cx="69" cy="39" r="4.5" fill={pupilColor} />
              <path d="M40 24C44 21 49 21 53 23" stroke="#4C1D95" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M67 23C71 21 76 21 80 24" stroke="#4C1D95" strokeWidth="3.5" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="48" cy="35" r="4.8" fill={pupilColor} />
              <circle cx="72" cy="35" r="4.8" fill={pupilColor} />
            </>
          )}

          {expression === "concerned" ? (
            <path d="M46 60C51 55 69 55 74 60" stroke="#F43F5E" strokeWidth="4" strokeLinecap="round" />
          ) : expression === "thinking" ? (
            <path d="M50 60C54 58 66 58 70 60" stroke="#7C3AED" strokeWidth="4" strokeLinecap="round" />
          ) : (
            <path d="M45 57C50 64 70 64 75 57" stroke="#10B981" strokeWidth="4" strokeLinecap="round" />
          )}
        </g>
      )}
    </svg>
  );
}
