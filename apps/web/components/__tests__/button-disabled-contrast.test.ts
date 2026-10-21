import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

function token(block: string, name: string) {
  const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`Missing ${name} token`);
  return value;
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

describe("disabled primary button token contrast", () => {
  it.each([
    ["light", /:root\s*\{([^}]+)\}/],
    ["dark", /:root\[data-theme="dark"\]\s*\{([^}]+)\}/]
  ])("keeps --muted readable on --surface-3 in %s mode", (_theme, selector) => {
    const block = css.match(selector as RegExp)?.[1];
    expect(block).toBeDefined();
    const ratio = contrast(token(block!, "muted"), token(block!, "surface-3"));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
