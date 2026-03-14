import { afterEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  DOMUS_THEME_KEY,
  getStoredTheme,
  isDarkTheme,
  normalizeTheme,
  setTheme
} from "../theme";

describe("theme utilities", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-domus-theme");
  });

  it("normalizes unknown values to atlas-light", () => {
    expect(normalizeTheme("mystery-theme")).toBe("atlas-light");
  });

  it("normalizes an empty string to atlas-light", () => {
    expect(normalizeTheme("")).toBe("atlas-light");
  });

  it("normalizes null values to atlas-light", () => {
    expect(normalizeTheme(null)).toBe("atlas-light");
  });

  it("normalizes undefined values to atlas-light", () => {
    expect(normalizeTheme(undefined)).toBe("atlas-light");
  });

  it("accepts atlas-light as a valid theme", () => {
    expect(normalizeTheme("atlas-light")).toBe("atlas-light");
  });

  it("accepts noctis-neon as a valid theme", () => {
    expect(normalizeTheme("noctis-neon")).toBe("noctis-neon");
  });

  it("accepts imperium-night as a valid theme", () => {
    expect(normalizeTheme("imperium-night")).toBe("imperium-night");
  });

  it("returns atlas-light when no stored theme exists", () => {
    expect(getStoredTheme()).toBe("atlas-light");
  });

  it("reads the stored theme from localStorage", () => {
    window.localStorage.setItem(DOMUS_THEME_KEY, "noctis-neon");
    expect(getStoredTheme()).toBe("noctis-neon");
  });

  it("normalizes invalid stored themes to atlas-light", () => {
    window.localStorage.setItem(DOMUS_THEME_KEY, "garbage");
    expect(getStoredTheme()).toBe("atlas-light");
  });

  it("identifies the light theme as non-dark", () => {
    expect(isDarkTheme("atlas-light")).toBe(false);
  });

  it("identifies noctis-neon as dark", () => {
    expect(isDarkTheme("noctis-neon")).toBe(true);
  });

  it("identifies imperium-night as dark", () => {
    expect(isDarkTheme("imperium-night")).toBe(true);
  });

  it("applies dark themes to the document element", () => {
    applyTheme("noctis-neon");
    expect(document.documentElement.getAttribute("data-domus-theme")).toBe("noctis-neon");
  });

  it("clears the document attribute for atlas-light", () => {
    document.documentElement.setAttribute("data-domus-theme", "imperium-night");
    applyTheme("atlas-light");
    expect(document.documentElement.getAttribute("data-domus-theme")).toBeNull();
  });

  it("persists and applies the selected theme", () => {
    setTheme("imperium-night");
    expect(window.localStorage.getItem(DOMUS_THEME_KEY)).toBe("imperium-night");
    expect(document.documentElement.getAttribute("data-domus-theme")).toBe("imperium-night");
  });
});
