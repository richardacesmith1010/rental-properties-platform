import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.");

const optionalOwnershipAccountIdSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid("Invalid ownership account.").optional()
);

const avatarFileSchema = z.preprocess(
  (value) => {
    if (!(value instanceof File) || value.size === 0) {
      return undefined;
    }

    return value;
  },
  z
    .custom<File>((value) => value instanceof File, {
      message: "Select a valid image file."
    })
    .refine((file) => file.size <= 5 * 1024 * 1024, "Profile photo must be 5MB or smaller.")
    .refine(
      (file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type),
      "Profile photo must be a JPG, PNG, or WebP image."
    )
    .optional()
);

export const createPropertySchema = z.object({
  name: z.string().min(1, "Property name is required."),
  addressLine1: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  postalCode: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code.").optional()
  ),
  ownerAccountId: optionalOwnershipAccountIdSchema
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
    path: ["endDate"],
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
  leaseId: z.string().uuid("Invalid lease ID."),
});

export const renewLeaseSchema = z
  .object({
    leaseId: z.string().uuid("Invalid lease ID."),
    newStartDate: isoDateSchema,
    newEndDate: isoDateSchema,
    newMonthlyRentDollars: z.coerce.number().min(0.01, "Rent must be positive."),
    newDueDayOfMonth: z.coerce.number().int().min(1).max(28, "Due day must be 1-28."),
  })
  .refine((data) => data.newEndDate > data.newStartDate, {
    message: "End date must be after start date.",
    path: ["newEndDate"],
  });

export const terminateLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  terminationReason: z.string().min(1, "Reason is required.").max(500),
});

export const updateLateFeeSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  lateFeeDollars: z.coerce.number().min(0, "Cannot be negative."),
  gracePeriodDays: z.coerce.number().int().min(0).max(30, "Must be 0-30 days."),
});

export const updatePropertySchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  name: z.string().min(1, "Property name is required."),
  addressLine1: z.string().min(1, "Street address is required."),
  city: z.string().min(1, "City is required."),
  state: z.string().min(1, "State is required."),
  postalCode: z
    .string()
    .min(1, "ZIP code is required.")
    .regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code."),
});

export const deletePropertySchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
});

export const updateUnitSchema = z.object({
  unitId: z.string().uuid("Invalid unit selection."),
  unitNumber: z.string().min(1, "Unit label is required."),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be 0 or more."),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be 0 or more."),
  monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0."),
});

export const deleteUnitSchema = z.object({
  unitId: z.string().uuid("Invalid unit selection."),
});

export const payChargeSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID."),
});

export const recordManualPaymentSchema = z.object({
  chargeId: z.string().uuid("Invalid charge ID."),
  amountDollars: z.coerce.number().positive("Amount must be greater than $0."),
  method: z.enum(["cash", "check", "ach", "other"]),
  referenceNote: z.string().optional()
});

export const updateManagementFeeSchema = z.object({
  propertyId: z.string().uuid("Invalid property."),
  managementFeeDollars: z.coerce.number().min(0, "Management fee cannot be negative.")
});

export const setupAutopaySchema = z.object({
  leaseId: z.string().uuid("Invalid lease selection.")
});

export const disableAutopaySchema = z.object({
  enrollmentId: z.string().uuid("Invalid autopay enrollment.")
});

/* ─── Maintenance ─── */

export const createMaintenanceTicketSchema = z.object({
  unitId: z.string().uuid("Invalid unit selection."),
  title: z
    .string()
    .min(1, "Title is required.")
    .max(200, "Title must be under 200 characters."),
  description: z
    .string()
    .min(1, "Description is required.")
    .max(2000, "Description must be under 2,000 characters."),
  priority: z.enum(["low", "medium", "high", "urgent"], {
    message: "Select a valid priority.",
  }),
});

export const updateTicketStatusSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  status: z.enum(["open", "in_progress", "resolved", "closed"], {
    message: "Select a valid status.",
  }),
});

export const updateTicketCostSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  actualCostDollars: z.coerce.number().min(0, "Cost cannot be negative."),
});

export const addTicketCommentSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  body: z.string().min(1, "Comment cannot be empty.").max(2000),
  isInternal: z.enum(["true", "false"]).optional().default("false"),
});

/* ─── Invitations ─── */

export const inviteTenantSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  fullName: z
    .string()
    .min(1, "Full name is required.")
    .max(100, "Name must be under 100 characters."),
  propertyId: z.string().uuid("Select a property first.")
});

export const inviteManagerSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  fullName: z
    .string()
    .min(1, "Full name is required.")
    .max(100, "Name must be under 100 characters."),
  propertyId: z.string().uuid("Invalid property selection."),
});

export const inviteOwnerSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  fullName: z
    .string()
    .min(1, "Full name is required.")
    .max(100, "Name must be under 100 characters."),
  ownershipAccountId: z.string().uuid("Invalid ownership account selection.")
});

export const resendInviteSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation ID."),
});

/* ─── Documents + E-sign ─── */

export const createDocumentTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Template name is required.")
    .max(120, "Template name must be under 120 characters."),
  category: z
    .string()
    .min(1, "Category is required.")
    .max(80, "Category must be under 80 characters."),
  bodyMarkdown: z
    .string()
    .min(1, "Template body is required.")
    .max(20000, "Template body must be under 20,000 characters."),
  ownerAccountId: optionalOwnershipAccountIdSchema
});

export const updateDocumentTemplateSchema = z.object({
  templateId: z.string().uuid("Invalid template ID."),
  name: z
    .string()
    .min(1, "Template name is required.")
    .max(120, "Template name must be under 120 characters."),
  category: z
    .string()
    .min(1, "Category is required.")
    .max(80, "Category must be under 80 characters."),
  bodyMarkdown: z
    .string()
    .min(1, "Template body is required.")
    .max(20000, "Template body must be under 20,000 characters.")
});

export const deleteDocumentTemplateSchema = z.object({
  templateId: z.string().uuid("Invalid template ID.")
});

export const createDocumentPacketSchema = z.object({
  templateId: z.string().uuid("Invalid template selection."),
  leaseId: z.string().uuid("Invalid lease selection.")
});

export const sendDocumentPacketSchema = z.object({
  packetId: z.string().uuid("Invalid document packet ID.")
});

export const signDocumentPacketSchema = z.object({
  packetId: z.string().uuid("Invalid document packet ID."),
  signatureText: z
    .string()
    .min(2, "Signature is required.")
    .max(200, "Signature must be under 200 characters.")
});

/* ─── Notifications ─── */

export const markNotificationReadSchema = z.object({
  notificationId: z.string().uuid("Invalid notification ID.")
});

export const completeOnboardingSchema = z.object({
  firstName: z.string().min(1, "First name is required.").max(80, "First name is too long."),
  lastName: z.string().min(1, "Last name is required.").max(80, "Last name is too long."),
  nickname: z.string().max(80, "Nickname must be 80 characters or fewer.").optional(),
  avatarFile: avatarFileSchema
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required.").max(80, "First name is too long."),
  lastName: z.string().min(1, "Last name is required.").max(80, "Last name is too long."),
  nickname: z.string().max(80, "Nickname must be 80 characters or fewer.").optional(),
  avatarFile: avatarFileSchema
});

export const uploadAvatarSchema = z
  .object({
    avatarFile: avatarFileSchema
  })
  .refine((data) => Boolean(data.avatarFile), {
    path: ["avatarFile"],
    message: "Profile photo is required."
  });

/* ─── Phase 10: Automations + Inbox + Leasing ─── */

export const enableAutomationSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  templateId: z.string().uuid("Invalid automation template.")
});

export const disableAutomationSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  templateId: z.string().uuid("Invalid automation template.")
});

export const createInboxThreadSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  subject: z
    .string()
    .min(1, "Thread subject is required.")
    .max(180, "Thread subject must be under 180 characters."),
  entityType: z
    .string()
    .min(1, "Entity type is required.")
    .max(80, "Entity type must be under 80 characters."),
  entityId: z
    .union([z.string().uuid("Entity ID must be a valid UUID."), z.literal("")])
    .optional()
});

export const sendInboxMessageSchema = z.object({
  threadId: z.string().uuid("Invalid thread selection."),
  body: z
    .string()
    .min(1, "Message body is required.")
    .max(4000, "Message must be under 4,000 characters.")
});

const optionalListingNumberSchema = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.coerce.number().min(0, "Value must be 0 or greater.").max(50, "Value is too high.").optional()
);

export const createRentalListingSchema = z.object({
  propertyId: z.string().uuid("Invalid property selection."),
  headline: z
    .string()
    .min(1, "Listing headline is required.")
    .max(200, "Headline must be under 200 characters."),
  description: z
    .string()
    .max(4000, "Description must be under 4,000 characters.")
    .optional(),
  askingRentDollars: z.coerce.number().positive("Asking rent must be greater than $0."),
  availableOn: z
    .string()
    .optional(),
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

/* ─── Vendors + Maintenance Completion ─── */

export const createVendorSchema = z.object({
  name: z
    .string()
    .min(1, "Vendor name is required.")
    .max(120, "Vendor name must be under 120 characters."),
  email: z
    .union([z.string().email("Enter a valid email address."), z.literal("")])
    .optional(),
  phone: z.string().max(30, "Phone must be under 30 characters.").optional(),
  tradeCategory: z.enum(
    [
      "plumbing",
      "electrical",
      "hvac",
      "general",
      "landscaping",
      "cleaning",
      "roofing",
      "painting",
      "appliance",
      "other"
    ],
    { message: "Select a valid trade category." }
  ),
  preferred: z.preprocess((value) => value === "true" || value === "on" || value === true, z.boolean()),
  ownerAccountId: optionalOwnershipAccountIdSchema
});

export const updateVendorSchema = z.object({
  vendorId: z.string().uuid("Invalid vendor."),
  name: z
    .string()
    .min(1, "Vendor name is required.")
    .max(120, "Vendor name must be under 120 characters."),
  email: z
    .union([z.string().email("Enter a valid email address."), z.literal("")])
    .optional(),
  phone: z.string().max(30, "Phone must be under 30 characters.").optional(),
  tradeCategory: z.enum(
    [
      "plumbing",
      "electrical",
      "hvac",
      "general",
      "landscaping",
      "cleaning",
      "roofing",
      "painting",
      "appliance",
      "other"
    ],
    { message: "Select a valid trade category." }
  ),
  preferred: z.preprocess((value) => value === "true" || value === "on" || value === true, z.boolean())
});

export const assignVendorSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  vendorId: z.string().uuid("Invalid vendor selection.")
});

export const uploadMaintenancePhotoSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  caption: z.string().max(300, "Caption must be under 300 characters.").optional()
});

export const uploadPropertyFileSchema = z.object({
  propertyId: z.string().uuid("Invalid property."),
  category: z.enum(
    ["lease_agreement", "inspection", "insurance", "tax", "receipt", "other"],
    { message: "Select a valid category." }
  ),
  visibility: z.enum(["owner_manager", "all"], { message: "Select a valid visibility option." }),
  description: z.string().max(500, "Description must be under 500 characters.").optional()
});

export const deletePropertyFileSchema = z.object({
  fileId: z.string().uuid("Invalid file.")
});

export const updateFileVisibilitySchema = z.object({
  fileId: z.string().uuid("Invalid file."),
  visibility: z.enum(["owner_manager", "all"], { message: "Select a valid visibility option." })
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

const checkboxBooleanSchema = z.preprocess(
  (value) => value === "true" || value === "on" || value === true,
  z.boolean()
);

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

/* ─── Ownership Accounts (LLC/Co-Owner) ─── */

export const createOwnershipAccountSchema = z.object({
  accountType: z.enum(["individual", "llc"], { message: "Select a valid account type." }),
  displayName: z
    .string()
    .min(1, "Display name is required.")
    .max(120, "Display name must be under 120 characters.")
});

export const addOwnershipMemberSchema = z.object({
  accountId: z.string().uuid("Invalid ownership account."),
  profileId: z.string().uuid("Invalid member profile."),
  canReceiveCriticalAlerts: z.coerce.boolean().optional()
});

export const linkPropertyToOwnershipAccountSchema = z.object({
  propertyId: z.string().uuid("Invalid property."),
  ownershipAccountId: z.string().uuid("Invalid ownership account.")
});

export const setupLlcAccountSchema = z.object({
  displayName: z
    .string()
    .min(2, "LLC name must be at least 2 characters")
    .max(100, "LLC name must be under 100 characters.")
});

export const joinLlcByCodeSchema = z.object({
  joinCode: z.string().length(6, "Join code must be 6 characters")
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
