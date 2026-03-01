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
  ownerAccountId: z.string().uuid("Invalid ownership account.").optional()
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

export const updateLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
  endDate: z.string().min(1, "End date is required."),
  dueDayOfMonth: z.coerce
    .number()
    .int()
    .min(1, "Due day must be between 1 and 28.")
    .max(28, "Due day must be between 1 and 28."),
  monthlyRentDollars: z.coerce.number().positive("Monthly rent must be greater than $0."),
  depositDollars: z.coerce.number().min(0, "Deposit cannot be negative."),
});

export const deleteLeaseSchema = z.object({
  leaseId: z.string().uuid("Invalid lease ID."),
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
  ownerAccountId: z.string().uuid("Invalid ownership account.").optional()
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
  trade: z.string().max(80, "Trade must be under 80 characters.").optional(),
  ownerAccountId: z.string().uuid("Invalid ownership account.").optional()
});

export const assignVendorSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  vendorId: z.string().uuid("Invalid vendor selection.")
});

export const uploadMaintenancePhotoSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  caption: z.string().max(300, "Caption must be under 300 characters.").optional()
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
