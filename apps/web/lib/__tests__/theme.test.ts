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

  it("returns atlas-light when no stored theme exists", () => {
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
    expect(document.documentElement.hasAttribute("data-domus-theme")).toBe(false);
  });

  it("persists and applies the selected theme", () => {
    setTheme("imperium-night");
    expect(window.localStorage.getItem(DOMUS_THEME_KEY)).toBe("imperium-night");
    expect(document.documentElement.getAttribute("data-domus-theme")).toBe("imperium-night");
  });
});
