import { z } from "zod";
import { checkboxBooleanSchema } from "@/lib/validations-auth";

export const payChargeSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID.")
});

export const deletePendingChargeSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID."),
  reason: z.string().trim().max(500, "Reason must be under 500 characters.").optional()
});

export const chargeCategorySchema = z.enum([
  "rent",
  "late_fee",
  "utility",
  "maintenance",
  "deposit",
  "key_replacement",
  "other"
]);

export const editableChargeStatusSchema = z.enum(["pending", "late", "waived"]);

export const editChargeSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID."),
  amountDollars: z.coerce
    .number()
    .positive("Amount must be greater than $0.")
    .max(999999.99, "Amount cannot exceed $999,999.99."),
  dueDate: z.string().min(1, "Due date is required."),
  category: chargeCategorySchema,
  status: editableChargeStatusSchema,
  notes: z.string().trim().max(1000, "Notes must be under 1,000 characters.").optional(),
  reason: z.string().trim().min(1, "Reason is required.").max(500, "Reason must be under 500 characters.")
});

export const createManualChargeSchema = z.object({
  leaseId: z.string().uuid("Select a valid lease."),
  amountDollars: z.coerce
    .number()
    .positive("Amount must be greater than $0.")
    .max(999999.99, "Amount cannot exceed $999,999.99."),
  dueDate: z.string().min(1, "Due date is required."),
  category: chargeCategorySchema,
  notes: z.string().trim().max(1000, "Description must be under 1,000 characters.").optional()
});

export const waiveChargeSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID."),
  reason: z.string().trim().max(500, "Reason must be under 500 characters.").optional()
});

export const recordManualPaymentSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID."),
  amountDollars: z.coerce
    .number()
    .positive("Amount must be greater than $0.")
    .max(999999.99, "Amount cannot exceed $999,999.99."),
  method: z.enum(["cash", "check", "ach", "other"]),
  referenceNote: z.string().max(500, "Reference note must be under 500 characters.").optional()
});

export const updateManagementFeeSchema = z.object({
  propertyId: z.string().uuid("Invalid property."),
  managementFeeDollars: z.coerce
    .number()
    .min(0, "Management fee cannot be negative.")
    .max(99999.99, "Management fee cannot exceed $99,999.99.")
});

export const setupAutopaySchema = z.object({
  leaseId: z.string().uuid("Invalid lease selection.")
});

export const disableAutopaySchema = z.object({
  enrollmentId: z.string().uuid("Invalid autopay enrollment.")
});

export const setupManagerPaymentConfigSchema = z
  .object({
    propertyId: z.string().uuid("Invalid property selection."),
    managerProfileId: z.string().uuid("Invalid manager selection."),
    paymentType: z.enum(["percentage", "flat"], {
      message: "Select a valid payment type."
    }),
    percentageRate: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().min(0.01, "Rate must be greater than 0%.").max(100, "Rate cannot exceed 100%.").optional()
    ),
    flatAmountDollars: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().min(0.01, "Amount must be greater than $0.").max(999999.99, "Amount is too large.").optional()
    ),
    baseRentDollars: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().min(0, "Base rent cannot be negative.").max(999999.99, "Amount is too large.").optional()
    ),
    label: z.string().min(1, "Label is required.").max(120, "Label must be under 120 characters."),
    frequency: z.enum(["monthly"], {
      message: "Monthly is the only supported frequency right now."
    }).default("monthly")
  })
  .refine(
    (data) =>
      (data.paymentType === "percentage" && data.percentageRate != null) ||
      (data.paymentType === "flat" && data.flatAmountDollars != null),
    {
      message: "Provide a rate for percentage payments or an amount for flat payments.",
      path: ["paymentType"]
    }
  );

export const recordManagerPaymentSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  managerProfileId: z.string().uuid("Invalid manager selection."),
  category: z.enum(["reimbursement", "custom"], {
    message: "Select a valid payment category."
  }),
  description: z.string().min(1, "Description is required.").max(200, "Description must be under 200 characters."),
  amountDollars: z.coerce.number().min(0.01, "Amount must be greater than $0.").max(999999.99),
  notes: z.string().max(500, "Notes must be under 500 characters.").optional()
});

export const updateManagerPaymentStatusSchema = z.object({
  paymentId: z.string().uuid("Invalid payment."),
  status: z.enum(["paid", "cancelled"], {
    message: "Select a valid payment status."
  })
});

export const generateManagerPaymentsSchema = z.object({
  propertyId: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().uuid("Invalid property selection.").optional()
  )
});

const expenseCategorySchema = z.enum(
  [
    "mortgage",
    "insurance",
    "property_tax",
    "hoa",
    "repair",
    "maintenance",
    "utility",
    "management_fee",
    "legal",
    "other"
  ],
  { message: "Select a valid expense category." }
);

const recurringFrequencySchema = z.enum(["monthly", "quarterly", "annually"], {
  message: "Select a valid recurring frequency."
});

export const sendBatchPaymentReminderSchema = z.object({
  chargeIds: z
    .array(z.string().uuid("Invalid charge selection."))
    .min(1, "Select at least one charge.")
    .max(100, "You can remind up to 100 charges at once.")
});

export const createExpenseSchema = z
  .object({
    propertyId: z.string().uuid("Invalid property."),
    category: expenseCategorySchema,
    description: z.string().max(500, "Description must be under 500 characters.").optional(),
    amountDollars: z.coerce.number().positive("Amount must be greater than $0."),
    expenseDate: z.string().min(1, "Expense date is required."),
    recurring: checkboxBooleanSchema,
    recurringFrequency: z.union([recurringFrequencySchema, z.literal("")]).optional(),
    vendorId: z.union([z.string().uuid("Invalid vendor."), z.literal("")]).optional(),
    receiptFileId: z.union([z.string().uuid("Invalid receipt file."), z.literal("")]).optional()
  })
  .refine((data) => !data.recurring || Boolean(data.recurringFrequency), {
    message: "Recurring frequency is required for recurring expenses.",
    path: ["recurringFrequency"]
  });

export const updateExpenseSchema = z
  .object({
    expenseId: z.string().uuid("Invalid expense."),
    category: expenseCategorySchema,
    description: z.string().max(500, "Description must be under 500 characters.").optional(),
    amountDollars: z.coerce.number().positive("Amount must be greater than $0."),
    expenseDate: z.string().min(1, "Expense date is required."),
    recurring: checkboxBooleanSchema,
    recurringFrequency: z.union([recurringFrequencySchema, z.literal("")]).optional(),
    vendorId: z.union([z.string().uuid("Invalid vendor."), z.literal("")]).optional(),
    receiptFileId: z.union([z.string().uuid("Invalid receipt file."), z.literal("")]).optional()
  })
  .refine((data) => !data.recurring || Boolean(data.recurringFrequency), {
    message: "Recurring frequency is required for recurring expenses.",
    path: ["recurringFrequency"]
  });

export const deleteExpenseSchema = z.object({
  expenseId: z.string().uuid("Invalid expense.")
});
