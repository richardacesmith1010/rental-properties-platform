import { describe, it, expect } from "vitest";
import { formatCurrency } from "../format";

describe("formatCurrency", () => {
  it("formats whole dollar amounts without decimals", () => {
    expect(formatCurrency(150000)).toBe("$1,500");
  });

  it("formats amounts with cents using 2 decimals", () => {
    expect(formatCurrency(150050)).toBe("$1,500.50");
  });

  it("formats zero as $0", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("formats sub-dollar amounts with cents", () => {
    expect(formatCurrency(99)).toBe("$0.99");
  });

  it("formats exact dollar amounts without decimals", () => {
    expect(formatCurrency(100)).toBe("$1");
  });

  it("formats negative amounts", () => {
    expect(formatCurrency(-150000)).toBe("-$1,500");
  });

  it("formats negative amounts with cents", () => {
    expect(formatCurrency(-150050)).toBe("-$1,500.50");
  });
});
