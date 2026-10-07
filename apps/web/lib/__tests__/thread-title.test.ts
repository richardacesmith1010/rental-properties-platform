import { describe, expect, it } from "vitest";
import { threadDisplayTitle } from "@/lib/inbox/thread-title";

describe("threadDisplayTitle", () => {
  it.each(["owner", "manager"] as const)("renames tenant conversations for %s", (role) => {
    expect(threadDisplayTitle("Messages with your landlord", role)).toBe("Messages with your tenant");
    expect(threadDisplayTitle("Manual payment review - Home", role)).toBe("Tenant says rent is paid - Home");
  });
  it("keeps the tenant conversation subject and renames payment reviews", () => {
    expect(threadDisplayTitle("Messages with your landlord", "tenant")).toBe("Messages with your landlord");
    expect(threadDisplayTitle("Manual payment review - Home", "tenant")).toBe("Rent you said is paid - Home");
  });
  it("preserves unrelated subjects", () => {
    expect(threadDisplayTitle("Repair question", "owner")).toBe("Repair question");
  });
});
