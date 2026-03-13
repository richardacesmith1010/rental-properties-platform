export type DomusTheme = "atlas-light" | "noctis-neon" | "imperium-night";

export const DOMUS_THEME_KEY = "domus-theme";

export function normalizeTheme(value: string | null | undefined): DomusTheme {
  return value === "noctis-neon" || value === "imperium-night" ? value : "atlas-light";
}

export function getStoredTheme(): DomusTheme {
  if (typeof window === "undefined") {
    return "atlas-light";
  }

  return normalizeTheme(window.localStorage.getItem(DOMUS_THEME_KEY));
}

export function applyTheme(theme: DomusTheme): void {
  if (typeof document === "undefined") {
    return;
  }

  if (theme === "atlas-light") {
    document.documentElement.removeAttribute("data-domus-theme");
  } else {
    document.documentElement.setAttribute("data-domus-theme", theme);
  }
}

export function setTheme(theme: DomusTheme): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DOMUS_THEME_KEY, theme);
  }

  applyTheme(theme);
}

export function isDarkTheme(theme?: DomusTheme): boolean {
  const resolvedTheme = theme ?? getStoredTheme();
  return resolvedTheme === "noctis-neon" || resolvedTheme === "imperium-night";
}
