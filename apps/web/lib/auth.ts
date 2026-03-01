import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "owner" | "manager" | "tenant";

export async function getAuthenticatedUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentUserRole(userId: string): Promise<AppRole> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = profile?.role;
  if (role === "owner" || role === "manager" || role === "tenant") {
    return role;
  }

  return "tenant";
}

export async function isTester(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("is_tester")
    .eq("id", userId)
    .single();

  if (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code ?? "") : "";
    const message = typeof error === "object" && error && "message" in error ? String(error.message ?? "").toLowerCase() : "";
    if (code === "42703" || (message.includes("column") && message.includes("does not exist"))) {
      return false;
    }
    return false;
  }

  return Boolean(data?.is_tester);
}

export function getRoleHomePath(role: AppRole) {
  if (role === "owner") {
    return "/owner";
  }
  if (role === "manager") {
    return "/manager";
  }
  return "/tenant";
}

export async function requireRole(allowed: AppRole[]) {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);

  if (!allowed.includes(role)) {
    redirect(getRoleHomePath(role));
  }

  return { user, role };
}
