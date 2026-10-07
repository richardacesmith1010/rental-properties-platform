import { describe, expect, it } from "vitest";
import {
  getTenantDisplayName,
  isTenantSection,
  parseSearchParam
} from "../tenant-page-helpers";

describe("tenant page helpers", () => {
  it("parses search parameters", () => {
    expect(parseSearchParam("charges")).toBe("charges");
    expect(parseSearchParam(["documents", "charges"])).toBe("documents");
    expect(parseSearchParam([])).toBeNull();
    expect(parseSearchParam(undefined)).toBeNull();
  });

  it("recognizes every valid tenant section and rejects invalid values", () => {
    for (const section of ["overview", "charges", "maintenance", "documents", "notifications"] as const) {
      expect(isTenantSection(section)).toBe(true);
    }
    expect(isTenantSection("bad")).toBe(false);
    expect(isTenantSection(null)).toBe(false);
  });

  it("chooses the trimmed nickname, first name, or email", () => {
    expect(getTenantDisplayName({ nickname: "  Court  ", fullName: "Court Smith", userEmail: "court@example.com" })).toBe(
      "Court"
    );
    expect(getTenantDisplayName({ nickname: null, fullName: "  Richard Smith  ", userEmail: "richard@example.com" })).toBe(
      "Richard"
    );
    expect(getTenantDisplayName({ nickname: "   ", fullName: "   ", userEmail: "resident@example.com" })).toBe(
      "resident@example.com"
    );
  });
});
