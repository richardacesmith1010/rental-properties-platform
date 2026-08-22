"use client";

import { validatePassword } from "@/lib/password-validation";

const strengthBarColors = [
  "bg-[var(--crit)]",
  "bg-[var(--warn)]",
  "bg-[var(--accent)]",
  "bg-[var(--pos)]"
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
            className={`h-1.5 rounded-full ${index < strength.score ? color : "bg-[var(--surface-2)]"}`}
          />
        ))}
      </div>
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="font-semibold text-[var(--ink)]">{strength.label}</span>
        {strength.errors.length > 0 ? (
          <span className="text-right text-[var(--muted)]">{strength.errors.join(" · ")}</span>
        ) : (
          <span className="text-right text-[var(--pos)]">Password looks good.</span>
        )}
      </div>
    </div>
  );
}
