import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

function markGroup(source) {
  const mark = source.toString().match(/<g\b[^>]*\sid="mark"[^>]*>([\s\S]*?)<\/g>/);
  if (!mark) throw new Error('Master icon is missing id="mark".');
  return mark[1];
}

export function launchGeometry(source, widthPt = 312) {
  const glyph = markGroup(source);
  // The master uses a semicircular arch and a butt-capped horizontal baseline.
  // Reject changed geometry rather than silently clipping a future master icon.
  const paths = [...glyph.matchAll(/<path d="([^"]+)" fill="none" stroke="[^"]+" stroke-width="([\d.]+)"\/>/g)];
  const arch = paths[0]?.[1].match(/^M([\d.]+) ([\d.]+) V([\d.]+) A([\d.]+) \4 0 0 1 ([\d.]+) \3 V\2$/);
  const baseline = paths[1]?.[1].match(/^M([\d.]+) ([\d.]+) H([\d.]+)$/);
  const knob = glyph.match(/<circle id="knob" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="[^"]+"\/>/);
  if (paths.length !== 2 || !arch || !baseline || !knob || Number(arch[5]) - Number(arch[1]) !== 2 * Number(arch[4])) {
    throw new Error("LaunchMark geometry changed; update its bounds and opaque probe before generating assets.");
  }
  const [, left, bottom, shoulder, radius, right] = arch.map(Number);
  const [, start, baselineY, end] = baseline.map(Number);
  const [, knobX, knobY, knobR] = knob.map(Number);
  const half = Number(paths[0][2]) / 2, baselineHalf = Number(paths[1][2]) / 2;
  const x = Math.min(start, end, left - half, knobX - knobR);
  const y = Math.min(shoulder - radius - half, baselineY - baselineHalf, knobY - knobR);
  const width = Math.max(start, end, right + half, knobX + knobR) - x;
  const height = Math.max(bottom, baselineY + baselineHalf, knobY + knobR) - y;
  const heightPt = widthPt * height / width;
  const pixelSizes = [1, 2, 3].map(scale => ({ scale, width: Math.round(widthPt * scale), height: Math.round(heightPt * scale) }));
  const largest = pixelSizes[2];
  const decodedBytes = largest.width * largest.height * 4;
  if (!Number.isFinite(widthPt) || widthPt <= 0 || pixelSizes.some(size => size.width < 1 || size.height < 1)) {
    throw new Error("LaunchMark width must produce positive pixel dimensions.");
  }
  if (decodedBytes > 4_000_000) {
    throw new Error(`LaunchMark 3x ${largest.width}×${largest.height} decodes to ${decodedBytes} bytes; limit is 4,000,000.`);
  }
  return {
    bounds: { x, y, width, height },
    fixture: { widthPt, heightPt, aspect: width / height,
      probe: { x: ((start + end) / 2 - x) * widthPt / width, y: (baselineY - y) * heightPt / height }, pixelSizes }
  };
}

export function buildLaunchSvg(source, foreground, bounds) {
  // Only doorway path strokes change; fills (including the knob) stay intact.
  const glyph = markGroup(source).replace(/<path\b[^>]*>/g, path =>
    path.replace(/\sstroke="[^"]*"/g, ` stroke="${foreground}"`));
  const { x, y, width, height } = bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">
    ${glyph}</svg>`;
}

export async function generateAssets({ widthPt = 312 } = {}) {
  const source = await readFile(new URL("../resources/icon.svg", import.meta.url));
  // Preflight ALL launch sizes before any file or directory is written, including icons.
  const { bounds, fixture } = launchGeometry(source, widthPt);
  const app = new URL("../ios/App/", import.meta.url);
  const catalog = new URL("App/Assets.xcassets/", app);
  const mark = new URL("LaunchMark.imageset/", catalog);
  const background = new URL("LaunchBackground.colorset/", catalog);
  const storyboardURL = new URL("App/Base.lproj/LaunchScreen.storyboard", app);
  const storyboard = (await readFile(storyboardURL, "utf8"))
    .replace(/multiplier="[^"]+" id="mark-aspect"/, `multiplier="${bounds.width}:${bounds.height}" id="mark-aspect"`)
    .replace(/constant="[^"]+" priority="750" id="mark-width"/, `constant="${widthPt}" priority="750" id="mark-width"`)
    .replace(/<image name="LaunchMark"[^>]*\/>/, `<image name="LaunchMark" width="${widthPt}" height="${fixture.heightPt}"/>`);
  const json = value => JSON.stringify(value, null, 2) + "\n";
  const info = { author: "xcode", version: 1 };
  await mkdir(mark, { recursive: true });
  await mkdir(background, { recursive: true });
  const images = [], colors = [];
  for (const [appearance, foreground, ground] of [
    ["light", "#0B0C0E", "#F3F4F6"], ["dark", "#FFFFFF", "#0E0F11"]
  ]) {
    const appearances = appearance === "dark" ? { appearances: [{ appearance: "luminosity", value: "dark" }] } : {};
    const [red, green, blue] = ground.slice(1).match(/../g).map(hex => `0x${hex}`);
    colors.push({ idiom: "universal", ...appearances,
      color: { "color-space": "srgb", components: { red, green, blue, alpha: "1.000" } } });
    const svg = buildLaunchSvg(source, foreground, bounds);
    for (const { scale, width, height } of fixture.pixelSizes) {
      const filename = `launch-mark-${appearance}@${scale}x.png`;
      await sharp(Buffer.from(svg), { density: 72 * width / bounds.width }).resize(width, height, { fit: "fill" })
        .png().toFile(fileURLToPath(new URL(filename, mark)));
      images.push({ filename, idiom: "universal", scale: `${scale}x`, ...appearances });
    }
  }
  await writeFile(new URL("Contents.json", mark), json({ images, info }));
  await writeFile(new URL("Contents.json", background), json({ colors, info }));
  await writeFile(new URL("AppTests/LaunchMarkFixture.json", app), json(fixture));
  await writeFile(storyboardURL, storyboard);

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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateAssets();
}
