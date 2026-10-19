// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ element: null as unknown, options: null as unknown }));
vi.mock("next/og", () => {
  return {
    ImageResponse: vi.fn(function (element, options) {
      capture.element = element;
      capture.options = options;
      return new Response();
    })
  };
});

import Icon, { size as iconSize } from "../icon";
import AppleIcon, { size as appleSize } from "../apple-icon";
import OpenGraphImage, { size as ogSize } from "../opengraph-image";

type Element = ReactElement<{ children?: ReactNode; style?: { background?: string }; [key: string]: unknown }>;
function walk(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!isValidElement(node)) return [node];
  return [node, ...walk((node as Element).props.children)];
}

for (const [name, render, size] of [
  ["icon", Icon, iconSize], ["apple-icon", AppleIcon, appleSize], ["opengraph-image", OpenGraphImage, ogSize]
] as const) {
  describe(name, () => {
    it("renders the graphite doorway without legacy branding", () => {
      render();
      const root = capture.element as Element;
      expect(root.props.style?.background).toBe("#0B0C0E");
      const expectedSizes = {
        icon: { width: 32, height: 32 },
        "apple-icon": { width: 180, height: 180 },
        "opengraph-image": { width: 1200, height: 630 }
      };
      expect(size).toEqual(expectedSizes[name]);
      expect(capture.options).toEqual(expectedSizes[name]);
      const tree = walk(root);
      const elements = tree.filter(isValidElement) as Element[];
      const svgs = elements.filter(element => element.type === "svg");
      expect(svgs).toHaveLength(1);
      const svgElements = walk(svgs[0]).filter(isValidElement) as Element[];
      const paths = svgElements.filter(element => element.type === "path");
      expect(paths.map(path => path.props.d)).toEqual(["M33 92 V50 A22 22 0 0 1 77 50 V92", "M20 92 H90"]);
      for (const path of paths) {
        expect(path.props).toMatchObject({ fill: "none", stroke: "#FFFFFF", strokeWidth: "7" });
      }
      const knobs = svgElements.filter(element => element.type === "circle");
      expect(knobs).toHaveLength(size.width < 120 ? 0 : 1);
      if (knobs.length) expect(knobs[0].props).toMatchObject({ cx: "66", cy: "70", r: "4", fill: "#8DA2F0" });
      expect(tree.filter(node => typeof node === "string").map(text => text.trim())).not.toContain("D");
      expect(JSON.stringify(root)).not.toMatch(/linear-gradient|#1D4ED8|#4f46e5|#7c3aed/i);
      if (name === "opengraph-image") {
        expect(tree).toContain("Domus — Rental Operations Platform");
        expect(tree).toContain("Run your rental portfolio with confidence.");
      } else {
        const ratio = Number(svgs[0].props.width) / size.width;
        expect(ratio).toBeGreaterThanOrEqual(0.61);
        expect(ratio).toBeLessThanOrEqual(0.63);
      }
    });

    it("returns an unmocked 200 PNG response", async () => {
      vi.doUnmock("next/og");
      vi.resetModules();
      const routes = {
        icon: () => import("../icon"),
        "apple-icon": () => import("../apple-icon"),
        "opengraph-image": () => import("../opengraph-image")
      };
      const route = await routes[name]();
      const response = route.default();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const header = new DataView(bytes.buffer);
      expect(header.getUint32(16)).toBe(size.width);
      expect(header.getUint32(20)).toBe(size.height);
    });
  });
}
