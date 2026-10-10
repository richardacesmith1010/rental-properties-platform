import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve("app/globals.css"), "utf8");
const root = postcss.parse(css);
const coarseRules: { selector: string; layer: string }[] = [];
root.walkAtRules("media", (media) => {
  if (media.params !== "(pointer: coarse)") return;
  media.walkRules((rule) => {
    const declarations = rule.nodes.filter((node) => node.type === "decl");
    expect(declarations).toHaveLength(1);
    expect(declarations[0]).toMatchObject({ prop: "font-size", value: "max(16px, 1em)" });
    expect(declarations[0].important).toBeFalsy();
    const layer = media.parent;
    coarseRules.push({ selector: rule.selector, layer: layer?.type === "atrule" ? layer.params : "" });
  });
});

describe("touch field typography", () => {
  it("clamps raw and shared controls in the component layer", () => {
    const rule = coarseRules.find(({ layer }) => layer === "components");
    expect(rule).toBeDefined();
    for (const tag of ["input", "select", "textarea"]) {
      const field = document.createElement(tag);
      expect(field.matches(rule!.selector)).toBe(true);
      field.className = "domus-input";
      expect(field.matches(rule!.selector)).toBe(true);
    }
    expect(rule!.selector).toContain(".domus-input");
    for (const type of ["checkbox", "radio", "range", "file"]) {
      const field = document.createElement("input");
      field.type = type;
      field.className = "domus-input";
      expect(field.matches(rule!.selector)).toBe(false);
    }
  });

  it("overrides small utilities without overriding larger utilities", () => {
    const rule = coarseRules.find(({ layer }) => layer === "utilities");
    expect(rule).toBeDefined();
    for (const tag of ["input", "select", "textarea"]) {
      for (const size of ["xs", "sm", "base", "lg", "xl", "2xl"]) {
        const field = document.createElement(tag);
        field.className = `domus-input text-${size}`;
        expect(field.matches(rule!.selector)).toBe(["xs", "sm"].includes(size));
      }
    }
    expect(css.indexOf("@tailwind components;")).toBeLessThan(css.indexOf("@tailwind utilities;"));
    expect(coarseRules).toHaveLength(2);
  });

  it("keeps pinch zoom available in CSS and the root viewport export", () => {
    expect(css).not.toMatch(/maximum-scale|user-scalable/i);
    const layout = readFileSync(path.resolve("app/layout.tsx"), "utf8");
    const viewport = layout.match(/export const viewport[^=]*=\s*\{([\s\S]*?)\n\};/);
    expect(viewport).not.toBeNull();
    expect(viewport![1]).not.toMatch(/maximumScale|userScalable/);
  });
});
