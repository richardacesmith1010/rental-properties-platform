import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth";
import { generateMonthlyChargesForOwner } from "@/lib/charges";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const origin = new URL(request.url).origin;

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    return NextResponse.redirect(`${origin}/`);
  }

  const message = await generateMonthlyChargesForOwner(user.id);
  const destination = role === "manager" ? "/manager" : "/owner";
  return NextResponse.redirect(`${origin}${destination}?generated=${encodeURIComponent(message)}`);
}
