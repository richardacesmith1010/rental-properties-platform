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
  if (role !== "owner") {
    return NextResponse.redirect(`${origin}/portal`);
  }

  const message = await generateMonthlyChargesForOwner(user.id);
  return NextResponse.redirect(`${origin}/owner?generated=${encodeURIComponent(message)}`);
}
