"use client";

import { useDomusTheme } from "@/components/theme-provider";
import type { ThemePreference } from "@/lib/theme";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  title: string;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Always use the light theme.",
    title: "Use the light theme."
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark theme.",
    title: "Use the dark theme."
  },
  {
    value: "system",
    label: "Match my device",
    description: "Follow your device setting automatically.",
    title: "Match your device setting."
  }
];

export function ThemeSettingsPanel() {
  const { theme, setTheme } = useDomusTheme();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Choose how Domus handles light and dark mode on this device. Changes apply right away.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {themeOptions.map((option) => {
          const selected = option.value === theme;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              title={option.title}
              aria-pressed={selected}
              className={[
                "rounded-2xl border p-4 text-left transition-colors duration-150",
                selected
                  ? "border-primary/30 bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:border-primary/20 hover:bg-background"
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{option.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                </div>
                <span
                  className={[
                    "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    selected ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
                  ].join(" ")}
                >
                  {selected ? "Selected" : "Choose"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
