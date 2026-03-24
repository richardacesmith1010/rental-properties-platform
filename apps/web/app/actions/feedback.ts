"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  FEEDBACK_OWNER_EMAIL,
  submitFeedbackSchema,
  updateFeedbackStatusSchema
} from "@/lib/feedback";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { buildFeedbackEmail } from "@/lib/email-templates";
import type { ActionState } from "./shared";
import { requireAuth } from "./auth-helpers";

function normalizeIpAddress(value: string | null) {
  if (!value) {
    return null;
  }

  return value.split(",")[0]?.trim() || null;
}

function getRequesterKey(email: string | null | undefined, userId: string | null, ipAddress: string | null) {
  if (userId) {
    return `user:${userId}`;
  }

  if (email) {
    return `email:${email.toLowerCase()}`;
  }

  if (ipAddress) {
    return `ip:${ipAddress}`;
  }

  return "anonymous";
}

function getFeedbackErrorMessage(error: unknown) {
  if (isMissingSchemaError(error)) {
    return "This feature requires a database update.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unable to send feedback right now.";
}

async function sendFeedbackNotificationEmail(params: {
  type: "bug" | "feature" | "other";
  message: string;
  email: string | null;
  userName: string | null;
  userRole: string | null;
  pageUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "notifications@domusbase.com";

  if (!apiKey) {
    console.error("Feedback email skipped: RESEND_API_KEY is missing.");
    return;
  }

  const { subject, html, text } = buildFeedbackEmail({
    type: params.type,
    message: params.message,
    email: params.email,
    userName: params.userName,
    userRole: params.userRole,
    pageUrl: params.pageUrl
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: FEEDBACK_OWNER_EMAIL,
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    console.error("Feedback email delivery failed:", errorText);
  }
}

export async function submitFeedback(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const requestHeaders = headers();
  const ipAddress =
    normalizeIpAddress(requestHeaders.get("x-forwarded-for")) ??
    normalizeIpAddress(requestHeaders.get("cf-connecting-ip")) ??
    normalizeIpAddress(requestHeaders.get("x-real-ip"));

  const parsed = submitFeedbackSchema.safeParse({
    type: formData.get("type"),
    message: formData.get("message"),
    email: formData.get("email"),
    pageUrl: formData.get("pageUrl"),
    userAgent: formData.get("userAgent") ?? requestHeaders.get("user-agent") ?? "",
    viewport: formData.get("viewport") ?? ""
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please review your feedback and try again."
    };
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const requesterKey = getRequesterKey(parsed.data.email ?? null, user?.id ?? null, ipAddress);
  if (!checkRateLimit(`submitFeedback:${requesterKey}`, 5, 60 * 60 * 1000).allowed) {
    return {
      success: false,
      error: "Too many feedback submissions. Please wait a bit before sending more."
    };
  }

  const admin = createAdminClient();
  let userRole: string | null = null;
  let userName: string | null = null;

  if (user?.id) {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role, full_name, nickname")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError && !isMissingSchemaError(profileError)) {
      console.error("submitFeedback profile lookup error:", profileError);
    }

    userRole =
      profile?.role === "owner" || profile?.role === "manager" || profile?.role === "tenant"
        ? profile.role
        : null;
    userName = profile?.nickname ?? profile?.full_name ?? user.email ?? null;
  }

  const feedbackInsert = {
    type: parsed.data.type,
    message: parsed.data.message,
    email: parsed.data.email ?? user?.email ?? null,
    profile_id: user?.id ?? null,
    page_url: parsed.data.pageUrl,
    user_agent: parsed.data.userAgent || null,
    viewport: parsed.data.viewport || null,
    user_role: userRole,
    status: "new" as const
  };

  const { error } = await admin.from("feedback").insert(feedbackInsert);

  if (error) {
    return {
      success: false,
      error: getFeedbackErrorMessage(error)
    };
  }

  void sendFeedbackNotificationEmail({
    type: parsed.data.type,
    message: parsed.data.message,
    email: parsed.data.email ?? user?.email ?? null,
    userName,
    userRole,
    pageUrl: parsed.data.pageUrl
  });

  revalidatePath("/ops");
  return { success: true, message: "Thanks! We got your feedback." };
}

export async function updateFeedbackStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  if (user.email?.toLowerCase() !== FEEDBACK_OWNER_EMAIL) {
    return { success: false, error: "Access denied." };
  }

  if (!checkRateLimit(`updateFeedbackStatus:${user.id}`, 60, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = updateFeedbackStatusSchema.safeParse({
    feedbackId: formData.get("feedbackId"),
    status: formData.get("status")
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid feedback update."
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("feedback")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.feedbackId);

  if (error) {
    return {
      success: false,
      error: getFeedbackErrorMessage(error)
    };
  }

  revalidatePath("/ops");
  return { success: true, message: "Feedback status updated." };
}
