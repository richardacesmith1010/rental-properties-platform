import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = await readFile(new URL("../resources/icon.svg", import.meta.url));
const resources = new URL("../resources/", import.meta.url);
const webIcons = new URL("../../web/public/icons/", import.meta.url);
await mkdir(webIcons, { recursive: true });
// Flatten the rounded SVG's corners: Apple's app icon must have no alpha.
await sharp(source).flatten({ background: "#1D4ED8" }).png().toFile(fileURLToPath(new URL("icon-only.png", resources)));
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512],
  ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(source).resize(size, size).flatten({ background: "#1D4ED8" })
    .png().toFile(fileURLToPath(new URL(name, webIcons)));
}
// Keep the same glyph, blue against white and white against dark.
const glyph = source.toString().match(/<path[^>]+\/>/)[0];
for (const [name, background, foreground] of [
  ["splash.png", "#FFFFFF", "#1D4ED8"], ["splash-dark.png", "#121316", "#FFFFFF"]
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732">
    <rect width="2732" height="2732" fill="${background}"/>
    <g transform="translate(1110 1110) scale(.5)">${glyph.replace("#FFFFFF", foreground)}</g></svg>`;
  await sharp(Buffer.from(svg)).flatten({ background }).png().toFile(fileURLToPath(new URL(name, resources)));
}
