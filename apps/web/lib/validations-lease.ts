import { z } from "zod";
import {
  hasChangedFields,
  isoDateSchema,
  optionalNullableStringUpdateSchema,
  optionalNumberUpdateSchema,
  optionalOwnershipAccountIdSchema,
  optionalPositiveIntegerSchema
} from "@/lib/validations-auth";

export const createLeaseSchema = z
  .object({
    unitId: z.string().uuid("Invalid unit selection."),
    tenantProfileId: z.string().uuid("Invalid tenant selection."),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    dueDayOfMonth: z.coerce
      .number()
      .int()
      .min(1, "Due day must be between 1 and 28.")
      .max(28, "Due day must be between 1 and 28."),
    monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0."),
    depositDollars: z.coerce.number().min(0, "Deposit cannot be negative."),
    gracePeriodDays: z.coerce.number().int().min(0).max(30).optional().default(5),
    lateFeeDollars: z.coerce.number().min(0).optional().default(0)
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date.",
    path: ["endDate"]
  });

const unifiedSetupPropertySchema = z.object({
  name: z.string().min(1, "Property name is required."),
  addressLine1: z.string().min(1, "Street address is required."),
  city: z.string().min(1, "City is required."),
  state: z.string().min(1, "State is required."),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code."),
  propertyType: z.enum(["single_family", "duplex", "triplex", "apartment", "condo", "townhouse"])
});

const unifiedSetupUnitSchema = z.object({
  id: z.string().min(1, "Unit ID is required."),
  label: z.string().min(1, "Unit label is required."),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be 0 or more."),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be 0 or more."),
  squareFeet: optionalPositiveIntegerSchema,
  monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0.")
});

const unifiedSetupLeaseSchema = z
  .object({
    hasTenant: z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()),
    leasedUnitId: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.string().min(1, "Choose a unit for the lease.").optional()
    ),
    tenantEmail: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.string().email("Enter a valid tenant email.").optional()
    ),
    startDate: z.preprocess((value) => (value === "" || value == null ? undefined : value), isoDateSchema.optional()),
    endDate: z.preprocess((value) => (value === "" || value == null ? undefined : value), isoDateSchema.optional()),
    monthlyRentDollars: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().positive("Monthly rent must be greater than $0.").optional()
    ),
    depositDollars: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().min(0, "Deposit cannot be negative.").optional().default(0)
    )
  })
  .superRefine((data, context) => {
    if (!data.hasTenant) {
      return;
    }

    if (!data.leasedUnitId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose the unit that should receive the lease.",
        path: ["leasedUnitId"]
      });
    }

    if (!data.tenantEmail) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tenant email is required.",
        path: ["tenantEmail"]
      });
    }

    if (!data.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lease start date is required.",
        path: ["startDate"]
      });
    }

    if (!data.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lease end date is required.",
        path: ["endDate"]
      });
    }

    if (data.startDate && data.endDate && data.endDate <= data.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be after start date.",
        path: ["endDate"]
      });
    }

    if (data.monthlyRentDollars == null || data.monthlyRentDollars <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monthly rent must be greater than $0.",
        path: ["monthlyRentDollars"]
      });
    }
  });

const unifiedPropertySetupPayloadSchema = z
  .object({
    property: unifiedSetupPropertySchema,
    units: z.array(unifiedSetupUnitSchema).min(1, "Add at least one unit."),
    lease: unifiedSetupLeaseSchema
  })
  .superRefine((data, context) => {
    if (!data.lease.hasTenant) {
      return;
    }

    if (!data.units.some((unit) => unit.id === data.lease.leasedUnitId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The selected lease unit is no longer in this setup draft.",
        path: ["lease", "leasedUnitId"]
      });
    }
  });

export const createPropertyWithSetupSchema = z.object({
  accountId: optionalOwnershipAccountIdSchema,
  payload: z
    .string()
    .min(1, "Setup details are missing.")
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Setup details are invalid."
        });
        return z.NEVER;
      }
    })
    .pipe(unifiedPropertySetupPayloadSchema)
});

export const updateLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  endDate: isoDateSchema,
  dueDayOfMonth: z.coerce
    .number()
    .int()
    .min(1, "Due day must be between 1 and 28.")
    .max(28, "Due day must be between 1 and 28."),
  monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0."),
  depositDollars: z.coerce.number().min(0, "Deposit cannot be negative."),
  gracePeriodDays: z.coerce.number().int().min(0).max(30).optional().default(5),
  lateFeeDollars: z.coerce.number().min(0).optional().default(0)
});

export const deleteLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID.")
});

export const renewLeaseSchema = z
  .object({
    leaseId: z.string().uuid("Invalid lease ID."),
    newStartDate: isoDateSchema,
    newEndDate: isoDateSchema,
    newMonthlyRentDollars: z.coerce.number().min(0.01, "Rent must be positive."),
    newDueDayOfMonth: z.coerce.number().int().min(1).max(28, "Due day must be 1-28.")
  })
  .refine((data) => data.newEndDate > data.newStartDate, {
    message: "End date must be after start date.",
    path: ["newEndDate"]
  });

export const terminateLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  terminationReason: z.string().min(1, "Reason is required.").max(500)
});

export const updateLeaseDetailsSchema = z
  .object({
    leaseId: z.string().uuid("Invalid lease ID."),
    startDate: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), isoDateSchema.optional()),
    endDate: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), isoDateSchema.optional()),
    dueDayOfMonth: optionalNumberUpdateSchema(
      z.coerce.number().int().min(1, "Due day must be between 1 and 28.").max(28, "Due day must be between 1 and 28.")
    ),
    monthlyRentDollars: optionalNumberUpdateSchema(
      z.coerce.number().positive("Monthly rent must be greater than $0.")
    ),
    depositDollars: optionalNumberUpdateSchema(z.coerce.number().min(0, "Deposit cannot be negative.")),
    gracePeriodDays: optionalNumberUpdateSchema(
      z.coerce.number().int().min(0, "Grace period must be 0 or more.").max(30, "Grace period must be 30 days or less.")
    ),
    lateFeeDollars: optionalNumberUpdateSchema(z.coerce.number().min(0, "Late fee cannot be negative.")),
    notes: optionalNullableStringUpdateSchema(1500, "Lease notes")
  })
  .refine((data) => hasChangedFields(data, ["leaseId"]), {
    message: "No lease changes were provided."
  });

export const updateLeaseRentAmountSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  monthlyRentDollars: z.coerce
    .number()
    .positive("Rent amount must be greater than $0.")
    .max(999999.99, "Rent amount cannot exceed $999,999.99.")
});

export const inviteTenantSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address."),
  fullName: z.string().min(1, "Full name is required.").max(100, "Name must be under 100 characters."),
  propertyId: z.string().uuid("Select a property first."),
  unitId: z.preprocess((value) => (value === "" ? undefined : value), z.string().uuid("Select a valid unit.").optional()),
  phone: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(30, "Phone number must be under 30 characters.").optional()
  ),
  monthlyRentDollars: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().min(0, "Rent must be zero or more.").optional()
  ),
  leaseStartDate: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid lease start date.").optional()
  ),
  leaseEndDate: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid lease end date.").optional()
  )
});

const optionalListingNumberSchema = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.coerce.number().min(0, "Value must be 0 or greater.").max(50, "Value is too high.").optional()
);

export const createRentalListingSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  headline: z.string().min(1, "Listing headline is required.").max(200, "Headline must be under 200 characters."),
  description: z.string().max(4000, "Description must be under 4,000 characters.").optional(),
  askingRentDollars: z.coerce.number().positive("Asking rent must be greater than $0."),
  availableOn: z.string().optional(),
  bedroomCount: optionalListingNumberSchema,
  bathroomCount: optionalListingNumberSchema
});

export const updateListingStatusSchema = z.object({
  listingId: z.string().uuid("Invalid listing ID."),
  status: z.enum(["draft", "published", "paused", "archived"], {
    message: "Select a valid listing status."
  })
});

export const createApplicationSchema = z.object({
  listingId: z.string().uuid("Select a listing."),
  propertyId: z.string().uuid("Select a property."),
  applicantEmail: z.string().email("Enter a valid email."),
  applicantName: z.string().optional(),
  applicantPhone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional()
});

export const reviewApplicationSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(["in_review", "approved", "rejected"]),
  notes: z.string().optional()
});

export const addApplicationNoteSchema = z.object({
  applicationId: z.string().uuid(),
  message: z.string().min(1, "Note cannot be empty.")
});

export const recordScreeningScoreSchema = z.object({
  applicationId: z.string().uuid(),
  score: z.coerce.number().int().min(0).max(1000),
  summary: z.string().optional()
});
