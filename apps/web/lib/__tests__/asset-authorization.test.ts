import { describe, expect, it } from "vitest";
import {
  canAccessDocumentPacket,
  canAccessMaintenancePhoto,
  canAccessPropertyFile
} from "@/lib/asset-authorization";

describe("canAccessMaintenancePhoto", () => {
  it("allows owner when they own the property", () => {
    expect(
      canAccessMaintenancePhoto({
        role: "owner",
        userId: "owner-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: true,
        isManagerAssigned: false,
        ticketTenantId: "tenant-1"
      })
    ).toBe(true);
  });

  it("denies owner for non-owned property", () => {
    expect(
      canAccessMaintenancePhoto({
        role: "owner",
        userId: "owner-2",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: false,
        ticketTenantId: "tenant-1"
      })
    ).toBe(false);
  });

  it("allows manager only when assigned", () => {
    expect(
      canAccessMaintenancePhoto({
        role: "manager",
        userId: "manager-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: true,
        ticketTenantId: "tenant-1"
      })
    ).toBe(true);

    expect(
      canAccessMaintenancePhoto({
        role: "manager",
        userId: "manager-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: false,
        ticketTenantId: "tenant-1"
      })
    ).toBe(false);
  });

  it("allows tenant only for their own ticket", () => {
    expect(
      canAccessMaintenancePhoto({
        role: "tenant",
        userId: "tenant-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: false,
        ticketTenantId: "tenant-1"
      })
    ).toBe(true);

    expect(
      canAccessMaintenancePhoto({
        role: "tenant",
        userId: "tenant-2",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: false,
        ticketTenantId: "tenant-1"
      })
    ).toBe(false);
  });
});

describe("canAccessDocumentPacket", () => {
  it("allows owner for owned property packets", () => {
    expect(
      canAccessDocumentPacket({
        role: "owner",
        userId: "owner-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: true,
        isManagerAssigned: false,
        isSigner: false
      })
    ).toBe(true);
  });

  it("allows manager only when assigned", () => {
    expect(
      canAccessDocumentPacket({
        role: "manager",
        userId: "manager-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: true,
        isSigner: false
      })
    ).toBe(true);

    expect(
      canAccessDocumentPacket({
        role: "manager",
        userId: "manager-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: false,
        isSigner: false
      })
    ).toBe(false);
  });

  it("allows tenant only when signer scope exists", () => {
    expect(
      canAccessDocumentPacket({
        role: "tenant",
        userId: "tenant-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: false,
        isSigner: true
      })
    ).toBe(true);

    expect(
      canAccessDocumentPacket({
        role: "tenant",
        userId: "tenant-1",
        propertyOwnerId: "owner-1",
        isPropertyAdmin: false,
        isManagerAssigned: false,
        isSigner: false
      })
    ).toBe(false);
  });
});

describe("canAccessPropertyFile", () => {
  it("allows owner and assigned manager", () => {
    expect(
      canAccessPropertyFile({
        role: "owner",
        userId: "owner-1",
        propertyOwnerId: "owner-1",
        isManagerAssigned: false,
        isPropertyAdmin: true,
        visibility: "owner_manager",
        tenantHasLease: false
      })
    ).toBe(true);

    expect(
      canAccessPropertyFile({
        role: "manager",
        userId: "manager-1",
        propertyOwnerId: "owner-1",
        isManagerAssigned: true,
        isPropertyAdmin: false,
        visibility: "owner_manager",
        tenantHasLease: false
      })
    ).toBe(true);
  });

  it("allows tenant only for shared files and active lease scope", () => {
    expect(
      canAccessPropertyFile({
        role: "tenant",
        userId: "tenant-1",
        propertyOwnerId: "owner-1",
        isManagerAssigned: false,
        isPropertyAdmin: false,
        visibility: "all",
        tenantHasLease: true
      })
    ).toBe(true);

    expect(
      canAccessPropertyFile({
        role: "tenant",
        userId: "tenant-1",
        propertyOwnerId: "owner-1",
        isManagerAssigned: false,
        isPropertyAdmin: false,
        visibility: "owner_manager",
        tenantHasLease: true
      })
    ).toBe(false);
  });
});
