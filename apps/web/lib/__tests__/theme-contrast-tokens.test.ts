import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
const light = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";
const darkAutomatic = css.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/)?.[1] ?? "";

const pairs = [
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["muted-foreground", "background"],
  ["pos", "pos-bg"],
  ["crit", "crit-bg"],
  ["warn", "warn-bg"],
  ["accent-contrast", "accent"],
  ["ink", "surface"]
] as const;

function token(name: string, theme: string): string {
  const value = theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim()
    ?? light.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`Missing --${name}`);
  const reference = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  return reference ? token(reference, theme) : value;
}

function luminance(hex: string): number {
  const channels = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)?.slice(1);
  if (!channels) throw new Error(`Expected a six-digit hex color: ${hex}`);
  const linear = channels.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("theme text contrast tokens", () => {
  for (const [themeName, theme] of [["light", light], ["dark", dark], ["automatic dark", darkAutomatic]] as const) {
    for (const [foreground, background] of pairs) {
      it(`${themeName}: ${foreground} on ${background} reaches 4.5:1`, () => {
        expect(theme).not.toBe("");
        const ratio = contrast(token(foreground, theme), token(background, theme));
        expect(ratio, `${foreground}/${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
