import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadOwnerSectionDataForUser } from "@/app/owner/owner-section-data-core";
import { encodeSectionValue } from "@/lib/owner-section-transport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Authentication required." }, 401);
    const input: Record<string, unknown> = {};
    for (const [key, value] of new URL(request.url).searchParams) {
      if (!["section", "account", "property", "mode", "preload"].includes(key) ||
          Object.prototype.hasOwnProperty.call(input, key)) {
        return json({ error: "Invalid section request." }, 400);
      }
      input[key] = key === "preload" && value === "1" ? true : value;
    }
    const result = await loadOwnerSectionDataForUser(user, input);
    if ("error" in result) return json(result, result.error === "Invalid section request." ? 400 : 500);
    return json(result.status === "ready" ? { ...result, data: encodeSectionValue(result.data) } : result);
  } catch {
    return json({ error: "Unable to load this section." }, 500);
  }
}
