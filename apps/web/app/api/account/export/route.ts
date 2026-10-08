import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCurrentUserRole } from "@/lib/auth";
import { buildAccountExport } from "@/lib/account-export";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const failure = (status: number, error: string) => NextResponse.json({ error }, {
  status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" }
});

export async function GET() {
  // API routes use a JSON 401, as in /api/pdf/receipts.
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error &&
      String(error.digest).startsWith("NEXT_REDIRECT")) return failure(401, "Please sign in.");
    console.error("Account export authentication failed", error);
    return failure(503, "Download is unavailable. Please try again.");
  }
  try {
    const role = await getCurrentUserRole(user.id);
    if (role === "owner") return failure(403, "Not available for owners yet.");

    let allowed: boolean;
    try {
      allowed = checkRateLimit(`export:${user.id}`, 5, 60 * 60 * 1000).allowed;
    } catch (error) {
      console.error("Account export rate limiter failed", error);
      return failure(503, "Download is unavailable. Please try again.");
    }
    if (!allowed) return failure(429, "Too many downloads. Try again later.");

    const generatedAt = new Date().toISOString();
    const data = await buildAccountExport(user.id, role, generatedAt);
    return new Response(JSON.stringify(data), { status: 200, headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="domus-my-data-${generatedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    } });
  } catch (error) {
    console.error("Account export failed", error);
    return failure(500, "Download is unavailable. Please try again.");
  }
}
