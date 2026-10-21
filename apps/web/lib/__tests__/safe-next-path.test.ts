import { describe, expect, it } from "vitest";
import { getSafeNextPath, isNextAllowedForRole } from "@/lib/route-resolver";

describe("safe return navigation", () => {
  it.each([
    ["/owner", "/owner"], ["/owner/money?year=2026", "/owner/money?year=2026"],
    ["/tenant?section=rent", "/tenant?section=rent"],
    ["/payments/receipt/abc", "/payments/receipt/abc"],
    ["/%6fwner/money", "/owner/money"],
    ["/owner?a=1&a=2&b=%20x", "/owner?a=1&a=2&b=%20x"],
    ["/tenant?section=rent%20due", "/tenant?section=rent%20due"],
    ["/owner?q=100%25", "/owner?q=100%25"],
    ["/owner?q=a%23b%26c%3Fd", "/owner?q=a%23b%26c%3Fd"],
    ["/owner?next=%2F%2Fevil.com", "/owner?next=%2F%2Fevil.com"],
    ["/owner#x", "/owner"], ["/owner?a=1#x", "/owner?a=1"]
  ])("S1/S2b keeps safe path %s", (raw, expected) => {
    expect(getSafeNextPath(raw)).toEqual(expected);
  });

  it.each([
    null, "", "owner", "//evil.com", "/\\evil.com", "/%2F%2Fevil.com", "/%5cevil.com",
    "https://evil.com", "/\tx", "/x\ny", "/ x", "/%E0%A4%A", `/${"x".repeat(512)}`,
    "/login", "/login?next=/owner", "/auth/callback", "/api/cron/x", "/onboarding",
    "/reset-password", "/%6cogin", "/%61uth/callback", "/%61pi/x", "/owner/../tenant",
    "/%2e%2e/owner", "/./owner", "/%252f%252fevil.com", "/%00x", "/%09x", "/%7fx",
    "/\u3000x", "/\u00a0x", "/\uff0fevil.com", "/\u2215evil.com", "/ops",
    "/owner%3Fx", "/owner%23x", "/owner x", "/owner?a=%zz", "/owner?a=%4",
    "/owner?a=%", "/owner?a=b c"
  ])("S2/S2b rejects unsafe path %s", (raw) => {
    expect(getSafeNextPath(raw)).toEqual(null);
  });

  it.each([
    ["owner", "/owner/money", true], ["owner", "/tenant", false],
    ["owner", "/ownerx", false], ["owner", "/Owner", false],
    ["owner", "/settings", true], ["tenant", "/tenant?section=rent", true],
    ["tenant", "/owner", false], ["manager", "/manager", true],
    ["manager", "/payments/receipt/1", true]
  ] as const)("S3 checks %s access to %s", (role, path, allowed) => {
    expect(isNextAllowedForRole(getSafeNextPath(path)!, role)).toEqual(allowed);
  });

  it("S13 rejects an unvalidated string at compile time", () => {
    // @ts-expect-error a raw string is not a SafeNextPath
    expect(isNextAllowedForRole("/owner", "owner")).toEqual(true);
  });
});
