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

export const createPartnerSchema = z.object({ accountId: z.string().uuid(), displayName: trimmed(80) });
export const updatePartnerSchema = z.object({ accountId: z.string().uuid(), partnerId: z.string().uuid(),
  displayName: trimmed(80) });
export const deletePartnerSchema = z.object({ accountId: z.string().uuid(), partnerId: z.string().uuid() });
const partnerEndpoint = z.string().uuid().nullable();
export const createPartnerPaymentSchema = z.object({ accountId: z.string().uuid(),
  fromPartnerId: partnerEndpoint, toPartnerId: partnerEndpoint,
  amountCents: z.number().int().positive(), paidOn: z.string().date(),
  kind: z.enum(["reimbursement", "manager_fee", "settle_up", "other"]),
  status: z.enum(["done", "planned"]), note: z.string().max(200).nullable() }).refine(
  (value) => value.fromPartnerId !== value.toPartnerId, "Pick two different payment endpoints."
);
export const updatePartnerPaymentSchema = createPartnerPaymentSchema.and(z.object({ id: z.string().uuid() }));
export const deletePartnerPaymentSchema = z.object({ accountId: z.string().uuid(), id: z.string().uuid() });
export const setExpensePaidBySchema = z.object({ expenseId: z.string().uuid(), partnerId: partnerEndpoint });

export const createDepositReturnSchema = z.object({
  leaseId: z.string().uuid(),
  returnedCents: z.number().int().min(0),
  returnedOn: z.string().date()
});
export const deleteDepositReturnSchema = z.object({ leaseId: z.string().uuid() });
export const updateManualBalanceSchema = z.object({
  bankAccountId: z.string().uuid(), balanceCents: z.number().int().safe()
});
