import { z } from "zod";

const uuid = z.string().uuid();
const direction = z.enum(["in", "out"]);
const category = z.enum(["mortgage", "insurance", "property_tax", "hoa", "repair", "maintenance",
  "utility", "management_fee", "legal", "other"]);
const row = z.object({
  i: z.number().int().min(0).max(4999),
  postedOn: z.iso.date(),
  amountCents: z.number().int().positive().max(2_147_483_647),
  direction,
  description: z.string().trim().min(1).max(300)
});
export const createBankAccountSchema = z.object({
  ownerAccountId: uuid, institution: z.enum(["fidelity", "navy_federal", "other"]),
  nickname: z.string().trim().min(1).max(60)
});
export const importBankRowsSchema = z.object({ bankAccountId: uuid, rows: z.array(row).min(1).max(5000) })
  .refine((value) => value.rows.every((item, index) => item.i === index));
export const bankChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rent"), rentChargeId: uuid }),
  z.object({ kind: z.literal("expense"), propertyId: uuid, category, label: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal("transfer") })
]);
export const answerBankItemSchema = z.object({
  bankAccountId: uuid, token: z.string().min(10).max(1500), decision: z.enum(["yes", "no"]),
  always: z.boolean(), choice: bankChoiceSchema.optional()
});
export const undoBankItemSchema = z.object({ bankTransactionId: uuid });
export const deleteBankAccountSchema = z.object({ bankAccountId: uuid });
