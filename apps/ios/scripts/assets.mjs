import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

export function buildSplashSvg(source, background, foreground) {
  const mark = source.toString().match(/<g\b[^>]*\sid="mark"[^>]*>([\s\S]*?)<\/g>/);
  if (!mark) throw new Error('Master icon is missing id="mark".');
  // Only doorway path strokes change; fills (including the knob) stay intact.
  const glyph = mark[1].replace(/<path\b[^>]*>/g, path =>
    path.replace(/\sstroke="[^"]*"/g, ` stroke="${foreground}"`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732">
    <rect width="2732" height="2732" fill="${background}"/>
    <g id="mark" transform="translate(596 502) scale(14)">${glyph}</g></svg>`;
}

async function generateAssets() {
  const source = await readFile(new URL("../resources/icon.svg", import.meta.url));
  const resources = new URL("../resources/", import.meta.url);
  const webIcons = new URL("../../web/public/icons/", import.meta.url);
  await mkdir(webIcons, { recursive: true });
  // Apple's app icon must be a full-bleed square without alpha.
  await sharp(source).flatten({ background: "#0B0C0E" }).png()
    .toFile(fileURLToPath(new URL("icon-only.png", resources)));
  for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512],
    ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
    await sharp(source).resize(size, size).flatten({ background: "#0B0C0E" })
      .png().toFile(fileURLToPath(new URL(name, webIcons)));
  }
  for (const [name, background, foreground] of [
    ["splash.png", "#F3F4F6", "#0B0C0E"], ["splash-dark.png", "#0E0F11", "#FFFFFF"]
  ]) {
    const svg = buildSplashSvg(source, background, foreground);
    await sharp(Buffer.from(svg)).flatten({ background }).png()
      .toFile(fileURLToPath(new URL(name, resources)));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateAssets();
}
