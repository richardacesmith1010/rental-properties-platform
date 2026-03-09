import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateUserStreak } from "@/lib/gamification";

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
        void updateUserStreak(user.id, "increment").catch(() => {});
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
        void updateUserStreak(user.id, "increment").catch(() => {});
      }

      if (type === "invite") {
        return NextResponse.redirect(`${origin}/complete-profile`);
      }
    }
  } catch (error) {
    const params = new URLSearchParams();
    params.set("error", "auth_callback_failed");
    if (error instanceof Error && error.message) {
      params.set("error_description", error.message);
    }
    return NextResponse.redirect(`${origin}/login?${params.toString()}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
