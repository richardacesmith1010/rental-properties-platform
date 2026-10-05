import { describe, expect, it } from "vitest";
import { tenantNavItems } from "@/components/dashboard/sidebar/nav-items";

describe("tenant navigation", () => {
  it("keeps the approved item order and labels", () => {
    expect(tenantNavItems.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "overview", label: "Home" },
      { id: "charges", label: "Rent" },
      { id: "maintenance", label: "Problems" },
      { id: "notifications", label: "Messages" },
      { id: "documents", label: "Your lease" }
    ]);
  });
});
