export * from "./validations-auth";
export * from "./validations-lease";
export * from "./validations-property";
export * from "./validations-payment";
export * from "./validations-entity";

import { z } from "zod";

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
