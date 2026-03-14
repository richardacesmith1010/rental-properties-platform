import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRoleHomePath } from "@/lib/auth";
import { updateUserStreak } from "@/lib/gamification";
import { sideEffectError } from "@/lib/logger";
import { notifyOwnerMembersOfAcceptedTenantInvite } from "@/lib/notifications";

function getSafeNextPath(rawNext: string | null) {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return "/";
  }
  return rawNext;
}

function hasInvitedSession(
  type: string | null,
  rawNext: string | null,
  user: {
    invited_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null
) {
  if (type === "invite") {
    return true;
  }

  const invitedAt = typeof user?.invited_at === "string" ? user.invited_at : null;
  const role = typeof user?.user_metadata?.role === "string" ? user.user_metadata.role : null;

  return Boolean(invitedAt && role && !rawNext);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const callbackError = searchParams.get("error");
  const callbackErrorDescription = searchParams.get("error_description");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const rawNext = searchParams.get("next");
  const next = getSafeNextPath(rawNext);
  const supabase = createClient();

  if (callbackError) {
    const params = new URLSearchParams();
    params.set("error", callbackError);
    if (callbackErrorDescription) {
      params.set("error_description", callbackErrorDescription);
    }
    return NextResponse.redirect(`${origin}/login?${params.toString()}`);
  }

  try {
    let authenticatedUserId: string | null = null;

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // PKCE code_verifier missing — email was already confirmed by Supabase
        // before the redirect, so treat this as a success and prompt sign-in.
        if (error.message?.includes("code verifier")) {
          return NextResponse.redirect(
            `${origin}/login?confirmed=true&next=${encodeURIComponent(next)}`
          );
        }
        throw error;
      }
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user?.id) {
        authenticatedUserId = user.id;
        void updateUserStreak(user.id, "increment").catch(
          sideEffectError("authCallback", "update_streak", {
            userId: user.id,
            entityType: "profile",
            entityId: user.id
          })
        );
        void notifyOwnerMembersOfAcceptedTenantInvite(user.id).catch(
          sideEffectError("authCallback", "create_notification", {
            userId: user.id,
            entityType: "profile",
            entityId: user.id
          })
        );
      }

      if (hasInvitedSession(type, rawNext, user)) {
        return NextResponse.redirect(`${origin}/complete-profile`);
      }
    } else if (tokenHash && (type === "email" || type === "recovery" || type === "invite")) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type
      });
      if (error) {
        throw error;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user?.id) {
        authenticatedUserId = user.id;
        void updateUserStreak(user.id, "increment").catch(
          sideEffectError("authCallback", "update_streak", {
            userId: user.id,
            entityType: "profile",
            entityId: user.id
          })
        );
        void notifyOwnerMembersOfAcceptedTenantInvite(user.id).catch(
          sideEffectError("authCallback", "create_notification", {
            userId: user.id,
            entityType: "profile",
            entityId: user.id
          })
        );
      }

      if (type === "invite") {
        return NextResponse.redirect(`${origin}/complete-profile`);
      }
    }

    if (authenticatedUserId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, onboarding_completed_at")
        .eq("id", authenticatedUserId)
        .maybeSingle();

      if (!profile?.onboarding_completed_at) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      const role =
        profile?.role === "owner" || profile?.role === "manager" || profile?.role === "tenant"
          ? profile.role
          : "tenant";
      const roleHomePath = getRoleHomePath(role);
      if (next === "/" || next === roleHomePath) {
        return NextResponse.redirect(`${origin}${roleHomePath}`);
      }
    }
  } catch (error) {
    const params = new URLSearchParams();
    const message = error instanceof Error ? error.message : "";

    if (message.toLowerCase().includes("expired") || message.includes("otp_expired")) {
      params.set("error", "invite_expired");
      params.set(
        "error_description",
        "This invitation link has expired. Please ask your landlord to resend the invite."
      );
    } else {
      params.set("error", "auth_callback_failed");
      if (message) {
        params.set("error_description", message);
      }
    }

    return NextResponse.redirect(`${origin}/login?${params.toString()}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
