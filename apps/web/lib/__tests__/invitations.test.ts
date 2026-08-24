import { describe, expect, it } from "vitest";
import { extractTenantInviteNames } from "@/lib/invitations";

describe("tenant invite onboarding metadata", () => {
  it("extracts the inviter and property names stored by tenant invites", () => {
    expect(
      extractTenantInviteNames({
        owner_name: "Smoke Owner",
        property_name: "Smoke Test Property",
        property_address: "135 Meridian Way"
      })
    ).toEqual({
      ownerName: "Smoke Owner",
      propertyName: "Smoke Test Property",
      propertyAddress: "135 Meridian Way"
    });
  });

  it("returns null names for legacy invite metadata", () => {
    expect(extractTenantInviteNames({ unit_label: "Unit S" })).toEqual({
      ownerName: null,
      propertyName: null,
      propertyAddress: null
    });
  });
});
