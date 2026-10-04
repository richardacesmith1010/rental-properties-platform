import { describe, expect, it } from "vitest";
import { decodeSectionValue, encodeSectionValue, decodeOwnerSectionResult } from "@/lib/owner-section-transport";

describe("section transport codec", () => {
  it("preserves maps, nested undefined, special numbers and defensive built-ins through JSON", () => {
    const value = {
      ownerConnectedMap: new Map([["property-1", true], ["property-2", false]]),
      nested: { missing: undefined, list: [undefined, null, NaN, Infinity, -Infinity, -0] },
      date: new Date("2026-01-01"), invalidDate: new Date(NaN),
      set: new Set([undefined, BigInt("9007199254740993")]),
      type: "undefined", value: null
    };
    expect(decodeSectionValue(JSON.parse(JSON.stringify(encodeSectionValue(value))))).toStrictEqual(value);
  });

  it.each([
    [], {}, { type: "unknown", value: [] }, { type: "undefined", value: 1 },
    { type: "map", value: [["key"]] }, { type: "number", value: "123" },
    { type: "object", value: [["a", 1], ["a", 2]] },
    { type: "object", value: [[1, 2]] }, { type: "date", value: "bad" },
    { type: "bigint", value: "1.2" }, { type: "array", value: [], extra: true }
  ])("rejects malformed wire data %j", value => {
    expect(() => decodeSectionValue(value)).toThrow("Invalid section payload");
  });

  it("rejects unsupported class instances instead of silently losing their type", () => {
    class Unsupported { value = 1; }
    expect(() => encodeSectionValue(new Unsupported())).toThrow();
  });

  it("keeps arbitrary metadata keys without prototype mutation", () => {
    const value = JSON.parse('{"__proto__":{"polluted":true}}');
    const decoded = decodeSectionValue(encodeSectionValue(value));
    expect(decoded).toStrictEqual(value);
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
  });

  it.each([null, {}, { status: "unknown" }, { status: "ready", data: {} },
    { status: "ready", data: encodeSectionValue({ loadedBundles: [1] }) }
  ])("rejects malformed response envelopes %j", value => {
    expect(() => decodeOwnerSectionResult(value)).toThrow();
  });
});
