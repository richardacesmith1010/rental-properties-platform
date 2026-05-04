import { z } from "zod";
import { ANNOUNCEMENT_SCOPES } from "@/lib/announcements";
import {
  NOTIFICATION_EMAIL_PREFERENCE_KEYS,
  NOTIFICATION_PAUSE_DURATIONS
} from "@/lib/notification-preferences";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.");

export const optionalOwnershipAccountIdSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid("Invalid ownership account.").optional()
);

export const optionalPositiveIntegerSchema = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().min(0, "Value must be 0 or more.").optional()
);

export const optionalNullableStringUpdateSchema = (maxLength: number, label: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value == null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().max(maxLength, `${label} must be under ${maxLength} characters.`).nullable().optional()
  );

export const optionalRequiredStringUpdateSchema = (
  requiredMessage: string,
  maxLength: number,
  maxLengthMessage: string
) =>
  z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (typeof value !== "string") return value;
      return value.trim();
    },
    z
      .string()
      .min(1, requiredMessage)
      .max(maxLength, maxLengthMessage)
      .optional()
  );

export const optionalNullableNumberUpdateSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === "" || value == null) return null;
    return value;
  }, schema.nullable().optional());

export const optionalNumberUpdateSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === undefined || value === "" || value == null ? undefined : value),
    schema.optional()
  );

export function hasChangedFields<T extends Record<string, unknown>>(data: T, idKeys: string[]) {
  return Object.entries(data).some(([key, value]) => !idKeys.includes(key) && value !== undefined);
}

export const avatarFileSchema = z.preprocess(
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

export const checkboxBooleanSchema = z.preprocess(
  (value) => value === "true" || value === "on" || value === true,
  z.boolean()
);

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

export const sendMessageToTenantSchema = z.object({
  recipientProfileId: z.string().uuid("Invalid tenant selection."),
  propertyId: z.string().uuid("Invalid property selection."),
  subject: z
    .string()
    .min(1, "Message subject is required.")
    .max(180, "Message subject must be under 180 characters."),
  body: z
    .string()
    .min(1, "Message body is required.")
    .max(4000, "Message must be under 4,000 characters.")
});

export const requestManualPaymentConfirmationSchema = z.object({
  chargeId: z.string().uuid("Invalid charge selection.")
});

const announcementTargetingBaseSchema = z.object({
  scope: z.enum(ANNOUNCEMENT_SCOPES),
  propertyIds: z.array(z.string().uuid("Invalid property selection.")).optional()
});

function validateAnnouncementTargeting(
  data: { scope: (typeof ANNOUNCEMENT_SCOPES)[number]; propertyIds?: string[] },
  context: z.RefinementCtx
) {
  if (data.scope === "all_administered" && (data.propertyIds?.length ?? 0) > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["propertyIds"],
      message: "Do not select properties when sending to all tenants."
    });
  }

  if (data.scope === "specific_properties" && (data.propertyIds?.length ?? 0) === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["propertyIds"],
      message: "Select at least one property."
    });
  }
}

export const announcementTargetingSchema = announcementTargetingBaseSchema.superRefine(
  validateAnnouncementTargeting
);

export const createAnnouncementSchema = announcementTargetingBaseSchema
  .extend({
    title: z
      .string()
      .min(1, "Title is required.")
      .max(200, "Title must be 200 characters or fewer."),
    body: z
      .string()
      .min(1, "Message is required.")
      .max(5000, "Message must be 5,000 characters or fewer.")
  })
  .superRefine(validateAnnouncementTargeting);

export const updateNotificationPreferenceSchema = z.object({
  notificationType: z.enum([
    "new_ticket",
    "late_rent",
    "ticket_resolved",
    "payment_recorded",
    "lease_updated",
    "document_sent",
    "document_signed",
    "application_reviewed",
    "rent_due_reminder",
    "invite_accepted",
    "achievement_unlocked",
    "owner_message",
    "announcement",
    "lease_expiring_soon",
    "lease_expired",
    "delinquency_escalation"
  ]),
  emailEnabled: checkboxBooleanSchema.optional().default(false),
  inAppEnabled: checkboxBooleanSchema.optional().default(false)
});

export const updateNotificationEmailPreferenceSchema = z.object({
  preferenceKey: z.enum(NOTIFICATION_EMAIL_PREFERENCE_KEYS),
  enabled: checkboxBooleanSchema.optional().default(false)
});

export const pauseNotificationEmailsSchema = z.object({
  duration: z.enum(NOTIFICATION_PAUSE_DURATIONS)
});

export const resumeNotificationEmailsSchema = z.object({});

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
