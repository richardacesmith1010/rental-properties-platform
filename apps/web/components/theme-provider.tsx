"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import {
  applyTheme,
  getStoredTheme,
  onSystemThemeChange,
  resolveTheme,
  setTheme as persistTheme,
  type ResolvedTheme,
  type ThemePreference
} from "@/lib/theme";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const storedTheme = getStoredTheme();
    applyTheme(storedTheme);
    setThemeState(storedTheme);
    setResolvedTheme(resolveTheme(storedTheme));

    return onSystemThemeChange((nextResolvedTheme) => {
      if (getStoredTheme() === "system") {
        setResolvedTheme(nextResolvedTheme);
      }
    });
  }, []);

  const setTheme = (nextTheme: ThemePreference) => {
    persistTheme(nextTheme);
    setThemeState(nextTheme);
    setResolvedTheme(resolveTheme(nextTheme));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        isDark: resolvedTheme === "dark",
        setTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useDomusTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useDomusTheme must be used within ThemeProvider.");
  }
  return context;
}
