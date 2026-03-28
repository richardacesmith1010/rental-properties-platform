import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRoleHomePath } from "@/lib/auth";
import { updateUserStreak } from "@/lib/gamification";
import { markTenantInvitationAccepted } from "@/lib/invitations";
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

function buildHashRelayResponse(requestUrl: string) {
  const safeLoginUrl = "/login?error=auth_callback_failed&error_description=Your+sign-in+link+needs+to+be+opened+again.";
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing you in…</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 24px;">
    <p>Signing you in…</p>
    <script>
      (function () {
        const url = new URL(${JSON.stringify(requestUrl)});
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : "";

        if (!hash) {
          window.location.replace(${JSON.stringify(safeLoginUrl)});
          return;
        }

        const hashParams = new URLSearchParams(hash);
        hashParams.forEach((value, key) => {
          url.searchParams.set(key, value);
        });
        url.hash = "";
        window.location.replace(url.toString());
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function trackAuthenticatedUser(params: {
  user: {
    id?: string;
    invited_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null;
  type: string | null;
  rawNext: string | null;
}) {
  const { user, type, rawNext } = params;
  if (!user?.id) {
    return null;
  }

  if (hasInvitedSession(type, rawNext, user)) {
    await markTenantInvitationAccepted(user.id);
  }

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

  return user.id;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const callbackError = searchParams.get("error");
  const callbackErrorDescription = searchParams.get("error_description");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const accessToken = searchParams.get("access_token");
  const refreshToken = searchParams.get("refresh_token");
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

  if (!code && !tokenHash && !(accessToken && refreshToken)) {
    return buildHashRelayResponse(request.url);
  }

  try {
    let authenticatedUserId: string | null = null;

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // PKCE code_verifier missing — email was already confirmed by Supabase
        // before the redirect, so treat this as a success and prompt sign-in.
        if (error.message?.includes("code verifier")) {
          if (type === "recovery") {
            // Reset link opened in a different browser than where it was requested.
            // PKCE verifier is missing — ask them to request a new link in this browser.
            const params = new URLSearchParams();
            params.set("error", "reset_link_expired");
            params.set("error_description", "Your reset link didn't work in this browser. Request a new one below.");
            return NextResponse.redirect(`${origin}/login?${params.toString()}`);
          }
          return NextResponse.redirect(
            `${origin}/login?confirmed=true&next=${encodeURIComponent(next)}`
          );
        }
        throw error;
      }
      const {
        data: { user }
      } = await supabase.auth.getUser();
      authenticatedUserId = await trackAuthenticatedUser({ user, type, rawNext });

      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }

      if (hasInvitedSession(type, rawNext, user)) {
        return NextResponse.redirect(`${origin}/complete-profile`);
      }
    } else if (tokenHash && (type === "email" || type === "recovery" || type === "invite" || type === "magiclink" || type === "email_change")) {
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
      authenticatedUserId = await trackAuthenticatedUser({ user, type, rawNext });

      if (type === "invite") {
        return NextResponse.redirect(`${origin}/complete-profile`);
      }

      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
    } else if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) {
        throw error;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();
      authenticatedUserId = await trackAuthenticatedUser({ user, type, rawNext });

      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }

      if (hasInvitedSession(type, rawNext, user)) {
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
