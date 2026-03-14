"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getCurrentUserRole, getRoleHomePath, type AppRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

interface AuthResult {
  user: { id: string; email?: string };
  role: AppRole;
  supabase: SupabaseClient;
}

/**
 * Authenticate the current user and verify their role.
 * Redirects to /login if not authenticated, or to the user's home route
 * if their role is not permitted for the action.
 */
export async function requireAuth(...allowedRoles: AppRole[]): Promise<AuthResult> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    redirect(getRoleHomePath(role));
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? undefined
    },
    role,
    supabase
  };
}
