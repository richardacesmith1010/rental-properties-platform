import { describe, expect, it } from "vitest";
import { getGeneratedMessage } from "@/lib/owner";

describe("getGeneratedMessage", () => {
  it("returns null when value is undefined", () => {
    expect(getGeneratedMessage(undefined)).toBeNull();
  });

  it("returns string value directly", () => {
    expect(getGeneratedMessage("Generated 2 new charges.")).toBe(
      "Generated 2 new charges."
    );
  });

  it("returns first value from array", () => {
    expect(
      getGeneratedMessage(["Generated 1 new charge.", "Ignored"])
    ).toBe("Generated 1 new charge.");
  });

  it("returns null for empty array", () => {
    expect(getGeneratedMessage([])).toBeNull();
  });
});
