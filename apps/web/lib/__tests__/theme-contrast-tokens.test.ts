import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
const light = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";
const darkAutomatic = css.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/)?.[1] ?? "";

const textPairs = (["ink", "ink-2", "muted"] as const)
  .flatMap((foreground) => (["ground", "surface", "surface-2"] as const)
    .map((background) => [foreground, background, 4.5] as const));
const statusPairs = (["pos", "crit", "warn"] as const)
  .flatMap((foreground) => [[foreground, `${foreground}-bg`, 4.5],
    [foreground, "surface", 4.5]] as const);
const pairs: ReadonlyArray<readonly [string, string, number]> = [
  ...textPairs, ...statusPairs,
  ["muted-foreground", "background", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "accent-weak", 4.5],
  ["accent-contrast", "accent", 4.5],
  ["faint", "surface", 3],
  ["accent", "surface", 3]
];

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
    for (const [foreground, background, minimum] of pairs) {
      it(`${themeName}: ${foreground} on ${background} reaches ${minimum}:1`, () => {
        expect(theme).not.toBe("");
        const ratio = contrast(token(foreground, theme), token(background, theme));
        expect(ratio, `${foreground}/${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
      });
    }
  }
});

it("keeps both dark token blocks identical", () => {
  const tokens = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)]
    .map(([, name, value]) => [name, value.trim()]));
  expect(tokens(darkAutomatic)).toEqual(tokens(dark));
});

it("defines the Wallet radius and shadow tokens", () => {
  for (const [name, value] of Object.entries({
    "radius-card": "16px", "radius-pass": "22px", "radius-control": "12px", "radius-pill": "999px"
  })) expect(token(name, light)).toBe(value);
  expect(token("shadow-sm", light)).toContain("0 1px 2px");
});
