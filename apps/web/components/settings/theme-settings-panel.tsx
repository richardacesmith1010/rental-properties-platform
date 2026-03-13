"use client";

import { useDomusTheme } from "@/components/theme-provider";
import type { DomusTheme } from "@/lib/theme";

const themeOptions: Array<{
  value: DomusTheme;
  label: string;
  description: string;
}> = [
  {
    value: "atlas-light",
    label: "Atlas Light",
    description: "Bright and clean with soft contrast."
  },
  {
    value: "noctis-neon",
    label: "Noctis Neon",
    description: "Dark with cool neon accents."
  },
  {
    value: "imperium-night",
    label: "Imperium Night",
    description: "Dark violet-gold, subtle Roman futurist tone."
  }
];

export function ThemeSettingsPanel() {
  const { theme, setTheme } = useDomusTheme();

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        Choose your interface style. Changes apply immediately and stay saved on this device.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {themeOptions.map((option) => {
          const selected = option.value === theme;
          const isLightTheme = option.value === "atlas-light";
          const containerClass = selected
            ? isLightTheme
              ? "border-violet-400 bg-violet-50 shadow-sm"
              : option.value === "noctis-neon"
                ? "border-emerald-400 bg-slate-900/80 shadow-sm"
                : "border-amber-400 bg-slate-950/80 shadow-sm"
            : "border-zinc-200 bg-white hover:border-zinc-300";
          const headingClass = selected && !isLightTheme ? "text-white" : "text-zinc-900";
          const copyClass = selected && !isLightTheme ? "text-slate-200" : "text-zinc-600";
          return (
            <div
              key={option.value}
              className={[
                "rounded-xl border p-4 text-left transition",
                containerClass
              ].join(" ")}
            >
              <p className={`text-sm font-semibold ${headingClass}`}>{option.label}</p>
              <p className={`mt-1 text-xs ${copyClass}`}>{option.description}</p>
              <button
                type="button"
                onClick={() => setTheme(option.value)}
                className={[
                  "mt-3 inline-flex rounded-md border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
                  selected
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                ].join(" ")}
                title={`Apply ${option.label} theme.`}
              >
                {selected ? "Active Theme" : "Apply Theme"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
