"use server";

import { checkAgreement } from "@/lib/legal-acceptance";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSafeNextPath } from "@/lib/route-resolver";
import { getCheckedAuthUser, getCurrentUserRole, getRoleHomePath, type AppRole } from "@/lib/auth";
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
async function authenticate(...allowedRoles: AppRole[]) {
  const supabase = createClient();
  const user = await getCheckedAuthUser(supabase);

  if (!user) {
    const next = getSafeNextPath((await headers()).get("x-domus-path"));
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    redirect(getRoleHomePath(role));
  }

  return {
    authUser: user,
    user: {
      id: user.id,
      email: user.email ?? undefined
    },
    role,
    supabase
  };
}

export async function requireAuth(...allowedRoles: AppRole[]): Promise<AuthResult> {
  const result = await authenticate(...allowedRoles);
  if (await checkAgreement(result.supabase, result.authUser) === "required") {
    const next = getSafeNextPath((await headers()).get("x-domus-path"));
    redirect(next ? `/agree?next=${encodeURIComponent(next)}` : "/agree");
  }
  const { user, role, supabase } = result;
  return { user, role, supabase };
}

export async function requireAuthForExit(...allowedRoles: AppRole[]): Promise<AuthResult> {
  const { user, role, supabase } = await authenticate(...allowedRoles);
  return { user, role, supabase };
}
