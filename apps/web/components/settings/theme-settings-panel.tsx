"use client";

import { useEffect, useState } from "react";

type DomusTheme = "atlas-light" | "noctis-neon" | "imperium-night";

const DOMUS_THEME_KEY = "domus-theme";

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
    description: "Dark bronze-red, subtle Roman futurist tone."
  }
];

export function ThemeSettingsPanel() {
  const [theme, setTheme] = useState<DomusTheme>("atlas-light");

  useEffect(() => {
    const storedTheme = (localStorage.getItem(DOMUS_THEME_KEY) as DomusTheme | null) ?? "atlas-light";
    document.documentElement.setAttribute("data-domus-theme", storedTheme);
    setTheme(storedTheme);
  }, []);

  const applyTheme = (nextTheme: DomusTheme) => {
    setTheme(nextTheme);
    localStorage.setItem(DOMUS_THEME_KEY, nextTheme);
    document.documentElement.setAttribute("data-domus-theme", nextTheme);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        Choose your interface style. Changes apply immediately and stay saved on this device.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {themeOptions.map((option) => {
          const selected = option.value === theme;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => applyTheme(option.value)}
              className={[
                "rounded-xl border p-4 text-left transition",
                selected
                  ? "border-indigo-400 bg-indigo-50 shadow-sm"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              ].join(" ")}
              title={`Apply ${option.label} theme.`}
            >
              <p className="text-sm font-semibold text-zinc-900">{option.label}</p>
              <p className="mt-1 text-xs text-zinc-600">{option.description}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                {selected ? "Active" : "Click to apply"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
