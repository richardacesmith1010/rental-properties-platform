import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(rawNext: string | null) {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return "/portal";
  }
  return rawNext;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const callbackError = searchParams.get("error");
  const callbackErrorDescription = searchParams.get("error_description");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = getSafeNextPath(searchParams.get("next"));
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
    } else if (tokenHash && (type === "email" || type === "recovery")) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type
      });
      if (error) {
        throw error;
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
