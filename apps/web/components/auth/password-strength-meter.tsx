"use client";

import { validatePassword } from "@/lib/password-validation";

const strengthBarColors = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-400",
  "bg-emerald-500"
] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = validatePassword(password);

  if (strength.score === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-4 gap-2" aria-hidden="true">
        {strengthBarColors.map((color, index) => (
          <div
            key={color}
            className={`h-1.5 rounded-full ${index < strength.score ? color : "bg-muted"}`}
          />
        ))}
      </div>
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{strength.label}</span>
        {strength.errors.length > 0 ? (
          <span className="text-right text-muted-foreground">{strength.errors.join(" · ")}</span>
        ) : (
          <span className="text-right text-emerald-600">Password looks good.</span>
        )}
      </div>
    </div>
  );
}
