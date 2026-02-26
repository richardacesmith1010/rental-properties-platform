import { z } from "zod";

export const createPropertySchema = z.object({
  name: z.string().min(1, "Property name is required."),
  addressLine1: z.string().min(1, "Street address is required."),
  city: z.string().min(1, "City is required."),
  state: z.string().min(1, "State is required."),
  postalCode: z
    .string()
    .min(1, "ZIP code is required.")
    .regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code."),
});

export const createUnitSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  unitNumber: z.string().min(1, "Unit number is required."),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be 0 or more."),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be 0 or more."),
  monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0."),
});

export const createLeaseSchema = z
  .object({
    unitId: z.string().uuid("Invalid unit selection."),
    tenantProfileId: z.string().uuid("Invalid tenant selection."),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().min(1, "End date is required."),
    dueDayOfMonth: z.coerce
      .number()
      .int()
      .min(1, "Due day must be between 1 and 28.")
      .max(28, "Due day must be between 1 and 28."),
    monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0."),
    depositDollars: z.coerce.number().min(0, "Deposit cannot be negative."),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date.",
    path: ["endDate"],
  });

export const payChargeSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID."),
});

/** Parse FormData against a Zod schema. Returns parsed data or a formatted error string. */
export function parseFormData<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const raw: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    raw[key] = typeof value === "string" ? value.trim() : value;
  });

  const result = schema.safeParse(raw);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Validation failed." };
  }

  return { success: true, data: result.data };
}
