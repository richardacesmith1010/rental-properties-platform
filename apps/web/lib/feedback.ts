import { z } from "zod";

export const FEEDBACK_OWNER_EMAIL = "richard.ace.smith@gmail.com";

export const feedbackTypeSchema = z.enum(["bug", "feature", "other"]);
export const feedbackStatusSchema = z.enum(["new", "reviewed", "resolved", "wontfix"]);

export type FeedbackType = z.infer<typeof feedbackTypeSchema>;
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

export interface FeedbackEntry {
  id: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  profileId: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  viewport: string | null;
  userRole: string | null;
  status: FeedbackStatus;
  createdAt: string;
  submitterName: string | null;
}

export const submitFeedbackSchema = z.object({
  type: feedbackTypeSchema,
  message: z
    .string()
    .trim()
    .min(10, "Please share at least 10 characters.")
    .max(4000, "Feedback must be under 4,000 characters."),
  email: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().email("Enter a valid email address.").max(160, "Email must be under 160 characters.").optional()
  ),
  pageUrl: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, "Missing page URL.").max(1000, "Page URL is too long.")
  ),
  userAgent: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(1000, "User agent is too long.").optional().default("")
  ),
  viewport: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(40, "Viewport is too long.").optional().default("")
  )
});

export const updateFeedbackStatusSchema = z.object({
  feedbackId: z.string().uuid("Invalid feedback record."),
  status: feedbackStatusSchema
});

export function getFeedbackTypeMeta(type: FeedbackType) {
  switch (type) {
    case "bug":
      return { label: "Bug", emoji: "🐛" };
    case "feature":
      return { label: "Feature", emoji: "💡" };
    default:
      return { label: "Other", emoji: "💬" };
  }
}

export function getFeedbackStatusLabel(status: FeedbackStatus) {
  switch (status) {
    case "new":
      return "New";
    case "reviewed":
      return "Reviewed";
    case "resolved":
      return "Resolved";
    default:
      return "Won't fix";
  }
}

export function getFeedbackStatusBadgeVariant(status: FeedbackStatus) {
  switch (status) {
    case "new":
      return "warning" as const;
    case "reviewed":
      return "outline" as const;
    case "resolved":
      return "success" as const;
    default:
      return "destructive" as const;
  }
}

export function getFeedbackSubmitterLabel(entry: Pick<FeedbackEntry, "submitterName" | "email">) {
  return entry.submitterName ?? entry.email ?? "Anonymous";
}
