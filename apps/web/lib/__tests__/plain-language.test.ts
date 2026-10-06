import path from "node:path";
import { describe, expect, it } from "vitest";
import exceptions from "../plain-language/exceptions.json";
import { scanSource, scanWeb } from "../plain-language/scan";

const root = path.resolve(__dirname, "../../../../");

describe("plain language guard", () => {
  it("catches banned words and long sentences", () => {
    const source = 'const copy = { text: "Please submit the charge now and wait for the reconciliation of your account soon." };';
    const hits = scanSource(source, "apps/web/components/fixture.tsx");
    expect(hits.filter((hit) => hit.reason.startsWith("banned word"))).toHaveLength(3);
    expect(hits.filter((hit) => hit.reason.startsWith("sentence has"))).toHaveLength(1);
  });

  it("ignores class names", () => {
    const source = '<div className="submit charge reconciliation long words in classes are never user facing at all" />';
    expect(scanSource(source, "apps/web/components/fixture.tsx")).toEqual([]);
  });

  it("keeps all user-facing copy clear", () => {
    const allowed = exceptions as Record<string, string>;
    expect(Object.keys(allowed).length).toBeLessThanOrEqual(25);
    for (const [key, reason] of Object.entries(allowed)) {
      expect(key).toMatch(/^apps\/web\/[^:]+:.+/);
      expect(reason.trim().length).toBeGreaterThan(5);
    }
    const hits = scanWeb(root).filter((hit) => !allowed[`${hit.file}:${hit.text}`]);
    expect(hits.map((hit) => `${hit.file}:${hit.line}  "${hit.text}"  → ${hit.reason}`)).toEqual([]);
  });
});
