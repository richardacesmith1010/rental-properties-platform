import { describe, expect, it } from "vitest";
import { addClientHomeSchema, createClientAccountSchema } from "@/lib/validations";

const validHome = {
  accountId: "11111111-1111-4111-8111-111111111111", name: "Home",
  addressLine1: "1 Main St", city: "Denver", state: "CO",
  postalCode: "80202", propertyType: "townhouse"
};

describe("client account validation", () => {
  it("trims names and accepts an optional email", () => {
    expect(createClientAccountSchema.parse({
      accountType: "llc", clientName: "  Client One  ", clientEmail: "client@example.com"
    })).toEqual({ accountType: "llc", clientName: "Client One", clientEmail: "client@example.com" });
    expect(createClientAccountSchema.safeParse({ accountType: "llc", clientName: " " }).success).toBe(false);
    expect(createClientAccountSchema.safeParse({
      accountType: "individual", clientName: "C", clientEmail: "bad"
    }).success).toBe(false);
  });

  it("requires a valid home address and allowed type", () => {
    expect(addClientHomeSchema.safeParse(validHome).success).toBe(true);
    expect(addClientHomeSchema.safeParse({ ...validHome, state: "Colorado" }).success).toBe(false);
    expect(addClientHomeSchema.safeParse({ ...validHome, postalCode: "8020" }).success).toBe(false);
    expect(addClientHomeSchema.safeParse({ ...validHome, propertyType: "castle" }).success).toBe(false);
  });
});
