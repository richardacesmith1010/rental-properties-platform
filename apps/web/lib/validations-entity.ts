import { z } from "zod";
import { parseInvitationEmails } from "@/lib/llc-invitations";
import {
  hasChangedFields,
  optionalNullableNumberUpdateSchema,
  optionalNullableStringUpdateSchema,
  optionalRequiredStringUpdateSchema,
  optionalOwnershipAccountIdSchema
} from "@/lib/validations-auth";

export const updateTenantDisplayInfoSchema = z
  .object({
    profileId: z.string().uuid("Invalid tenant selection."),
    fullName: optionalRequiredStringUpdateSchema(
      "Tenant name is required.",
      120,
      "Tenant name must be under 120 characters."
    ),
    email: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (typeof value !== "string") return value;
        return value.trim();
      },
      z.string().email("Enter a valid tenant email.").max(160, "Tenant email must be under 160 characters.").optional()
    ),
    phone: optionalNullableStringUpdateSchema(30, "Phone")
  })
  .refine((data) => hasChangedFields(data, ["profileId"]), {
    message: "No tenant changes were provided."
  });

export const updateManagerInfoSchema = z
  .object({
    propertyId: z.string().uuid("Invalid property."),
    managerProfileId: z.string().uuid("Invalid manager."),
    configId: z.preprocess(
      (value) => (value === undefined || value === "" ? undefined : value),
      z.string().uuid("Invalid manager payment config.").optional()
    ),
    fullName: optionalRequiredStringUpdateSchema(
      "Manager name is required.",
      120,
      "Manager name must be under 120 characters."
    ),
    email: z.preprocess(
      (value) => {
        if (value === undefined) return undefined;
        if (typeof value !== "string") return value;
        return value.trim();
      },
      z.string().email("Enter a valid manager email.").max(160, "Manager email must be under 160 characters.").optional()
    ),
    label: optionalRequiredStringUpdateSchema(
      "Payment label is required.",
      120,
      "Payment label must be under 120 characters."
    ),
    paymentType: z.preprocess(
      (value) => (value === undefined || value === "" ? undefined : value),
      z.enum(["percentage", "flat"]).optional()
    ),
    percentageRate: optionalNullableNumberUpdateSchema(
      z.coerce.number().min(0, "Percentage must be 0 or more.").max(100, "Percentage must be 100 or less.")
    ),
    flatAmountDollars: optionalNullableNumberUpdateSchema(
      z.coerce.number().min(0, "Flat fee cannot be negative.").max(999999.99, "Flat fee cannot exceed $999,999.99.")
    ),
    baseRentDollars: optionalNullableNumberUpdateSchema(
      z.coerce.number().min(0, "Base rent cannot be negative.").max(999999.99, "Base rent cannot exceed $999,999.99.")
    ),
    frequency: z.preprocess(
      (value) => (value === undefined || value === "" ? undefined : value),
      z.enum(["monthly", "biweekly", "weekly"]).optional()
    )
  })
  .refine((data) => hasChangedFields(data, ["propertyId", "managerProfileId", "configId"]), {
    message: "No manager changes were provided."
  });

export const createMaintenanceTicketSchema = z.object({
  unitId: z.string().uuid("Invalid unit selection."),
  title: z.string().min(1, "Title is required.").max(200, "Title must be under 200 characters."),
  description: z
    .string()
    .min(1, "Description is required.")
    .max(2000, "Description must be under 2,000 characters."),
  priority: z.enum(["low", "medium", "high", "urgent"], {
    message: "Select a valid priority."
  })
});

export const updateTicketStatusSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  status: z.enum(["open", "in_progress", "resolved", "closed"], {
    message: "Select a valid status."
  })
});

export const updateTicketCostSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  actualCostDollars: z.coerce.number().min(0, "Cost cannot be negative.")
});

export const addTicketCommentSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  body: z.string().min(1, "Comment cannot be empty.").max(2000),
  isInternal: z.enum(["true", "false"]).optional().default("false")
});

export const inviteManagerSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address."),
  fullName: z.string().min(1, "Full name is required.").max(100, "Name must be under 100 characters."),
  propertyId: z.string().uuid("Invalid property selection.")
});

export const inviteOwnerSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address."),
  fullName: z.string().min(1, "Full name is required.").max(100, "Name must be under 100 characters."),
  ownershipAccountId: z.string().uuid("Invalid ownership account selection.")
});

export const resendInviteSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation ID.")
});

export const revokeInviteSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation ID.")
});

export const createDocumentTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required.").max(120, "Template name must be under 120 characters."),
  category: z.string().min(1, "Category is required.").max(80, "Category must be under 80 characters."),
  bodyMarkdown: z.string().min(1, "Template body is required.").max(20000, "Template body must be under 20,000 characters."),
  ownerAccountId: optionalOwnershipAccountIdSchema
});

export const updateDocumentTemplateSchema = z.object({
  templateId: z.string().uuid("Invalid template ID."),
  name: z.string().min(1, "Template name is required.").max(120, "Template name must be under 120 characters."),
  category: z.string().min(1, "Category is required.").max(80, "Category must be under 80 characters."),
  bodyMarkdown: z.string().min(1, "Template body is required.").max(20000, "Template body must be under 20,000 characters.")
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
  signatureText: z.string().min(2, "Signature is required.").max(200, "Signature must be under 200 characters.")
});

export const uploadMaintenancePhotoSchema = z.object({
  ticketId: z.string().uuid("Invalid ticket ID."),
  caption: z.string().max(300, "Caption must be under 300 characters.").optional()
});

export const deleteMaintenancePhotoSchema = z.object({
  photoId: z.string().uuid("Invalid photo ID.")
});

export const createOwnershipAccountSchema = z.object({
  accountType: z.enum(["individual", "llc"], { message: "Select a valid account type." }),
  displayName: z.string().min(1, "Display name is required.").max(120, "Display name must be under 120 characters.")
});

export const addOwnershipMemberSchema = z.object({
  accountId: z.string().uuid("Invalid ownership account."),
  profileId: z.string().uuid("Invalid member profile."),
  canReceiveCriticalAlerts: z.coerce.boolean().optional()
});

export const removeOwnershipMemberSchema = z.object({
  accountId: z.string().uuid("Invalid ownership account."),
  profileId: z.string().uuid("Invalid member profile.")
});

export const linkPropertyToOwnershipAccountSchema = z.object({
  propertyId: z.string().uuid("Invalid property."),
  ownershipAccountId: z.string().uuid("Invalid ownership account.")
});

const accountGovernanceVoteSchema = z.object({
  requestId: z.string().uuid("Invalid request."),
  vote: z.enum(["approve", "reject"], {
    message: "Select a valid vote."
  })
});

export const renameOwnershipAccountSchema = z.object({
  accountId: z.string().uuid("Invalid ownership account."),
  newName: z.string().min(1, "Account name is required.").max(100, "Account name must be under 100 characters.")
});

export const requestDeleteLlcSchema = z.object({
  accountId: z.string().uuid("Invalid ownership account."),
  reason: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(500, "Reason must be under 500 characters.").optional()
  )
});

export const voteOnAccountRenameSchema = accountGovernanceVoteSchema;
export const voteOnDeleteLlcSchema = accountGovernanceVoteSchema;

export const setupLlcAccountSchema = z.object({
  displayName: z.string().min(2, "LLC name must be at least 2 characters").max(100, "LLC name must be under 100 characters.")
});

export const joinLlcByCodeSchema = z.object({
  joinCode: z.string().length(6, "Join code must be 6 characters")
});

export const sendLlcInvitationsSchema = z.object({
  accountId: z.string().uuid("Invalid ownership account."),
  emails: z
    .string()
    .min(1, "Enter at least one email address.")
    .superRefine((value, context) => {
      const parsed = parseInvitationEmails(value);
      if (parsed.emails.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter at least one valid email address."
        });
      }
      if (parsed.invalidEmails.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid email: ${parsed.invalidEmails[0]}`
        });
      }
    })
});

export const resendLlcInvitationSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation.")
});

export const cancelLlcInvitationSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation.")
});

export const signInToLlcInvitationSchema = z.object({
  token: z.string().uuid("Invalid invitation."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.")
});

export const createLlcInvitationAccountSchema = z
  .object({
    token: z.string().uuid("Invalid invitation."),
    firstName: z.string().min(1, "First name is required.").max(80, "First name must be under 80 characters."),
    lastName: z.string().min(1, "Last name is required.").max(80, "Last name must be under 80 characters."),
    password: z.string().min(6, "Password should be at least 6 characters."),
    confirmPassword: z.string().min(6, "Confirm your password.")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });
