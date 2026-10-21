import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedRoutePrefixes = [
  "/owner",
  "/manager",
  "/tenant",
  "/onboarding",
  "/complete-profile",
  "/reset-password",
  "/settings",
] as const;

function isProtectedRoute(pathname: string) {
  return protectedRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
}

function forwardedHeaders(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Navigation metadata only. Never use this header for authorization.
  requestHeaders.delete("x-domus-path");
  requestHeaders.set("x-domus-path", request.nextUrl.pathname + request.nextUrl.search);
  return requestHeaders;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders(request) } });
  const hadAuthCookie = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders(request) } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // Refresh the auth token — this is the critical PKCE fix
  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user && hadAuthCookie && isProtectedRoute(request.nextUrl.pathname)) {
      supabaseResponse.cookies.set("x-session-expired", "1", {
        path: "/",
        maxAge: 10
      });
    }
  } catch {
    // Auth service unavailable — allow request through. Route-level auth still protects access.
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!\\.well-known/|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
