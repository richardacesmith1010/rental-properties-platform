import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildLaunchSvg, launchGeometry, generateAssets } from "./assets.mjs";

const source = await readFile(new URL("../resources/icon.svg", import.meta.url), "utf8");
const catalogRoot = new URL("../ios/App/App/Assets.xcassets/", import.meta.url);
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const tags = (svg, name) => [...svg.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(m => attributes(m[0]));
const paths = ["M33 92 V50 A22 22 0 0 1 77 50 V92", "M20 92 H90"];
const fixtureURL = new URL("../ios/App/AppTests/LaunchMarkFixture.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureURL, "utf8"));
const rgb = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16));

async function inspect(file, background, size) {
  const image = sharp(fileURLToPath(file));
  const metadata = await image.metadata();
  assert.equal(metadata.hasAlpha, false, `${file}: must be opaque`);
  if (size) {
    assert.equal(metadata.width, size[0], `${file}: width`);
    assert.equal(metadata.height, size[1], `${file}: height`);
  }
  const corner = await image.clone().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  assert.deepEqual([...corner], rgb(background), `${file}: corner`);
  return { image, metadata };
}

async function catalog(folder) {
  const directory = new URL(`${folder}/`, catalogRoot);
  const { images } = JSON.parse(await readFile(new URL("Contents.json", directory), "utf8"));
  const referenced = images.filter(entry => entry.filename);
  assert.ok(referenced.length > 0);
  assert.deepEqual((await readdir(directory)).sort(), ["Contents.json", ...new Set(referenced.map(e => e.filename))].sort());
  return { directory, images: referenced };
}

test("master icon is full-bleed graphite", () => {
  assert.doesNotMatch(source, /\brx\s*=/);
  assert.deepEqual(tags(source, "svg")[0], {
    xmlns: "http://www.w3.org/2000/svg", width: "1024", height: "1024", viewBox: "0 0 1024 1024"
  });
  assert.deepEqual(tags(source, "rect"), [{ width: "1024", height: "1024", fill: "#0B0C0E" }]);
  assert.deepEqual(tags(source, "g"), [{ id: "mark", transform: "translate(204 166) scale(5.6)" }]);
  const inner = source.match(/<g\b[^>]*>([\s\S]*?)<\/g>/)[1];
  assert.deepEqual(tags(inner, "path"), paths.map(d => ({ d, fill: "none", stroke: "#FFFFFF", "stroke-width": "7" })));
  assert.deepEqual(tags(inner, "circle"), [{ id: "knob", cx: "66", cy: "70", r: "4", fill: "#8DA2F0" }]);
});

test("L6 launch SVG tightly crops the master glyph and preserves its knob", () => {
  const { bounds, fixture: computed } = launchGeometry(source);
  assert.deepEqual(bounds, { x: 20, y: 24.5, width: 70, height: 71 });
  assert.deepEqual(computed, fixture);
  assert.equal(fixture.widthPt, 312);
  for (const foreground of ["#0B0C0E", "#FFFFFF"]) {
    const svg = buildLaunchSvg(source, foreground, bounds);
    assert.deepEqual(tags(svg, "svg")[0], {
      xmlns: "http://www.w3.org/2000/svg", width: "70", height: "71", viewBox: "20 24.5 70 71"
    });
    assert.deepEqual(tags(svg, "rect"), []);
    assert.deepEqual(tags(svg, "path"), paths.map(d => ({ d, fill: "none", stroke: foreground, "stroke-width": "7" })));
    assert.deepEqual(tags(svg, "circle"), tags(source, "circle"));
  }
  const future = source.replace('</g>', '<path d="M1 1 H2" fill="#FFFFFF" stroke="#FFFFFF"/></g>');
  const futurePath = tags(buildLaunchSvg(future, "#0B0C0E", bounds), "path")[2];
  assert.equal(futurePath.fill, "#FFFFFF");
  assert.equal(futurePath.stroke, "#0B0C0E");
  assert.throws(() => launchGeometry(source.replace('id="mark"', 'id="other"')), /missing id="mark"/);
  assert.throws(() => launchGeometry(source.replace('A22 22', 'A23 23')), /geometry changed/);
});

test("every AppIcon catalog image is right", async () => {
  const { directory, images } = await catalog("AppIcon.appiconset");
  for (const entry of images) {
    const scale = entry.scale ? parseFloat(entry.scale) : 1;
    const size = entry.size ? entry.size.split("x").map(n => Number(n) * scale) : [1024, 1024];
    await inspect(new URL(entry.filename, directory), "#0B0C0E", size);
  }
});

test("L1 L6b LaunchMark catalog has six bounded alpha PNGs with the shared opaque probe", async () => {
  const { directory, images } = await catalog("LaunchMark.imageset");
  assert.equal(images.length, 6);
  for (const size of fixture.pixelSizes) {
    assert.equal(size.width, Math.round(fixture.widthPt * size.scale));
    assert.equal(size.height, Math.round(fixture.heightPt * size.scale));
    for (const dark of [false, true]) {
      const entries = images.filter(entry => entry.scale === `${size.scale}x` && Boolean(entry.appearances) === dark);
      assert.equal(entries.length, 1);
      assert.deepEqual(entries[0].appearances, dark ? [{ appearance: "luminosity", value: "dark" }] : undefined);
      const image = sharp(fileURLToPath(new URL(entries[0].filename, directory)));
      const metadata = await image.metadata();
      assert.equal(metadata.width, size.width);
      assert.equal(metadata.height, size.height);
      assert.equal(metadata.hasAlpha, true);
      assert.ok(metadata.width * metadata.height * 4 <= 4_000_000);
      const corner = await image.clone().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
      assert.equal(corner[3], 0);
      const left = Math.floor(fixture.probe.x * size.width / fixture.widthPt);
      const top = Math.floor(fixture.probe.y * size.height / fixture.heightPt);
      const pixel = await image.clone().extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
      assert.deepEqual([...pixel], [...rgb(dark ? "#FFFFFF" : "#0B0C0E"), 255], "baseline probe must be opaque doorway");
    }
  }
  assert.deepEqual(fixture.pixelSizes.map(size => size.scale), [1, 2, 3]);
});

test("L2 LaunchBackground catalog resolves the approved light and dark grounds", async () => {
  const { colors } = JSON.parse(await readFile(new URL("LaunchBackground.colorset/Contents.json", catalogRoot), "utf8"));
  assert.equal(colors.length, 2);
  for (const [dark, expected] of [[false, "#F3F4F6"], [true, "#0E0F11"]]) {
    const entries = colors.filter(entry => Boolean(entry.appearances) === dark);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].appearances, dark ? [{ appearance: "luminosity", value: "dark" }] : undefined);
    const color = entries[0].color;
    assert.equal(color["color-space"], "srgb");
    assert.deepEqual(["red", "green", "blue"].map(key => Number(color.components[key])), rgb(expected));
    assert.equal(Number(color.components.alpha), 1);
  }
});

test("L3 launch storyboard uses native centered constrained views and no legacy images remain", async () => {
  for (const url of [new URL("Splash.imageset", catalogRoot),
    new URL("../resources/splash.png", import.meta.url), new URL("../resources/splash-dark.png", import.meta.url)]) {
    await assert.rejects(stat(url), { code: "ENOENT" });
  }
  const xml = await readFile(new URL("../ios/App/App/Base.lproj/LaunchScreen.storyboard", import.meta.url), "utf8");
  assert.match(xml, /launchScreen="YES"/);
  assert.doesNotMatch(xml, /customClass|safeArea|image="Splash"/);
  const [root] = tags(xml, "view"), [image] = tags(xml, "imageView");
  assert.equal(root.key, "view");
  assert.equal(tags(xml, "imageView").length, 1);
  assert.equal(image.image, "LaunchMark");
  assert.equal(image.contentMode, "scaleAspectFit");
  assert.equal(image.translatesAutoresizingMaskIntoConstraints, "NO");
  assert.ok(tags(xml, "color").some(color => color.key === "backgroundColor" && color.name === "LaunchBackground"));
  const constraints = tags(xml, "constraint");
  assert.equal(constraints.length, 5);
  for (const axis of ["centerX", "centerY"]) {
    assert.ok(constraints.some(c => c.firstItem === image.id && c.firstAttribute === axis &&
      c.secondItem === root.id && c.secondAttribute === axis && !c.constant && !c.priority));
  }
  const aspect = constraints.find(c => c.id === "mark-aspect");
  assert.equal(aspect.firstAttribute, "width");
  assert.equal(aspect.secondItem, image.id);
  assert.equal(aspect.secondAttribute, "height");
  const [w, h] = aspect.multiplier.split(":").map(Number);
  assert.equal(w / h, fixture.aspect);
  const preferred = constraints.find(c => c.id === "mark-width");
  assert.equal(preferred.firstAttribute, "width");
  assert.equal(Number(preferred.constant), fixture.widthPt);
  assert.equal(preferred.priority, "750");
  const margin = constraints.find(c => c.id === "mark-margin");
  assert.equal(margin.firstItem, image.id);
  assert.equal(margin.firstAttribute, "width");
  assert.equal(margin.secondItem, root.id);
  assert.equal(margin.secondAttribute, "width");
  assert.equal(margin.relation, "lessThanOrEqual");
  assert.equal(Number(margin.constant), -32);
  assert.equal(margin.priority, undefined);
});

test("L6 L6b forced oversize generation throws before any output changes", async () => {
  // Include all generator output trees and their file mtimes, not just launch PNGs.
  async function snapshot(url) {
    const info = await stat(url);
    if (info.isDirectory()) {
      const children = await readdir(url);
      const directory = new URL(url.href.endsWith("/") ? url.href : url.href + "/");
      return Promise.all(children.sort().map(name => snapshot(new URL(name, directory))));
    }
    return [fileURLToPath(url), info.mtimeMs, (await readFile(url)).toString("base64")];
  }
  const roots = [new URL("../resources/", import.meta.url), catalogRoot,
    new URL("../ios/App/AppTests/", import.meta.url), new URL("../../web/public/icons/", import.meta.url),
    new URL("../ios/App/App/Base.lproj/LaunchScreen.storyboard", import.meta.url)];
  const before = await Promise.all(roots.map(snapshot));
  await assert.rejects(generateAssets({ widthPt: 400 }), /LaunchMark 3x 1200×1217 decodes to 5841600 bytes; limit is 4,000,000/);
  assert.deepEqual(await Promise.all(roots.map(snapshot)), before);
});

test("web PNGs are graphite", async () => {
  for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512],
    ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
    await inspect(new URL(`../../web/public/icons/${name}`, import.meta.url), "#0B0C0E", [size, size]);
  }
  await inspect(new URL("../resources/icon-only.png", import.meta.url), "#0B0C0E", [1024, 1024]);
});
