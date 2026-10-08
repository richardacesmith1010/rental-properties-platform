export * from "./validations-auth";
export * from "./validations-lease";
export * from "./validations-property";
export * from "./validations-payment";
export * from "./validations-entity";

import { z } from "zod";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const createClientAccountSchema = z.object({
  accountType: z.enum(["individual", "llc"]),
  clientName: trimmed(120),
  clientEmail: z.preprocess(
    (value) => value === "" || value == null ? undefined : value,
    z.string().trim().email().max(254).optional()
  )
});

export const addClientHomeSchema = z.object({
  accountId: z.string().uuid(),
  name: trimmed(120),
  addressLine1: trimmed(200),
  city: trimmed(100),
  state: z.string().regex(/^[A-Za-z]{2}$/),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  propertyType: z.preprocess(
    (value) => value === "" || value == null ? undefined : value,
    z.enum(["single_family", "duplex", "triplex", "apartment", "condo", "townhouse"]).optional()
  )
});

export function dollarsToCents(value: string): number {
  if (value === "") return 0;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new Error("Enter a valid dollar amount.");
  const [dollars, fraction = ""] = value.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > 1_000_000_000) throw new Error("Enter a valid dollar amount.");
  return cents;
}

const taxDollarsSchema = z.string().transform((value, context) => {
  try {
    return dollarsToCents(value);
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid dollar amount." });
    return z.NEVER;
  }
});

export const updatePropertyTaxYearSchema = z.object({
  propertyId: z.string().uuid(),
  taxYear: z.coerce.number().int().min(2000).max(2100),
  mortgageInterest: taxDollarsSchema,
  escrowPropertyTax: taxDollarsSchema,
  escrowInsurance: taxDollarsSchema,
  depreciation: taxDollarsSchema
});

export const ownerStatementRequestSchema = z.object({
  accountId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
});
