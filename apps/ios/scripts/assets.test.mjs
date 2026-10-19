import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildSplashSvg } from "./assets.mjs";

const source = await readFile(new URL("../resources/icon.svg", import.meta.url), "utf8");
const catalogRoot = new URL("../ios/App/App/Assets.xcassets/", import.meta.url);
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const tags = (svg, name) => [...svg.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(m => attributes(m[0]));
const paths = ["M33 92 V50 A22 22 0 0 1 77 50 V92", "M20 92 H90"];
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

test("splash SVG is exact", () => {
  for (const [background, foreground] of [["#F3F4F6", "#0B0C0E"], ["#0E0F11", "#FFFFFF"]]) {
    const svg = buildSplashSvg(source, background, foreground);
    assert.deepEqual(tags(svg, "svg")[0], { xmlns: "http://www.w3.org/2000/svg", width: "2732", height: "2732" });
    assert.deepEqual(tags(svg, "g"), [{ id: "mark", transform: "translate(596 502) scale(14)" }]);
    assert.deepEqual(tags(svg, "rect"), [{ width: "2732", height: "2732", fill: background }]);
    assert.deepEqual(tags(svg, "path"), paths.map(d => ({ d, fill: "none", stroke: foreground, "stroke-width": "7" })));
    assert.deepEqual(tags(svg, "circle"), tags(source, "circle"));
  }
  const future = source.replace('</g>', '<path d="M1 1 H2" fill="#FFFFFF" stroke="#FFFFFF"/></g>');
  const futurePath = tags(buildSplashSvg(future, "#F3F4F6", "#0B0C0E"), "path")[2];
  assert.equal(futurePath.fill, "#FFFFFF");
  assert.equal(futurePath.stroke, "#0B0C0E");
  assert.throws(() => buildSplashSvg(source.replace('id="mark"', 'id="other"'), "#F3F4F6", "#0B0C0E"), /missing id="mark"/);
});

test("every AppIcon catalog image is right", async () => {
  const { directory, images } = await catalog("AppIcon.appiconset");
  for (const entry of images) {
    const scale = entry.scale ? parseFloat(entry.scale) : 1;
    const size = entry.size ? entry.size.split("x").map(n => Number(n) * scale) : [1024, 1024];
    await inspect(new URL(entry.filename, directory), "#0B0C0E", size);
  }
});

test("splash catalog is wired for light and dark", async () => {
  const { directory, images } = await catalog("Splash.imageset");
  assert.equal(images.length, 6);
  for (const scale of ["1x", "2x", "3x"]) {
    for (const dark of [false, true]) {
      const entries = images.filter(entry => entry.scale === scale && (dark
        ? entry.appearances?.some(a => a.appearance === "luminosity" && a.value === "dark")
        : !entry.appearances));
      assert.equal(entries.length, 1, `${scale}: ${dark ? "dark" : "light"}`);
      const { image, metadata } = await inspect(new URL(entries[0].filename, directory), dark ? "#0E0F11" : "#F3F4F6");
      // The baseline is y=502+92*14 in the 2732px source canvas.
      const row = await image.extract({ left: Math.round(metadata.width * 0.3),
        top: Math.round(metadata.height * (502 + 92 * 14) / 2732),
        width: Math.round(metadata.width * 0.4), height: 1 }).raw().toBuffer();
      const expected = rgb(dark ? "#FFFFFF" : "#0B0C0E");
      assert.ok([...row].some((_, i) => i % 3 === 0 && expected.every((value, j) => row[i + j] === value)),
        `${entries[0].filename}: baseline must contain doorway pixels`);
    }
  }
});

test("web PNGs are graphite", async () => {
  for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512],
    ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180]]) {
    await inspect(new URL(`../../web/public/icons/${name}`, import.meta.url), "#0B0C0E", [size, size]);
  }
  await inspect(new URL("../resources/icon-only.png", import.meta.url), "#0B0C0E", [1024, 1024]);
});
