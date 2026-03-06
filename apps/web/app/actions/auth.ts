"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut(_formData: FormData) {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
