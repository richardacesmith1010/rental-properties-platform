import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing ${name} for Playwright E2E tests.`);
  }

  return value;
}

export function getAdminClient() {
  return createClient(
    requireEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false }
    }
  );
}

export function buildTestEmail(label: string) {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `e2e-${normalized}-${randomUUID().slice(0, 8)}@test.domusbase.com`;
}

export async function createTestUser(options: {
  email: string;
  password: string;
  role: "owner" | "manager" | "tenant";
  fullName?: string;
  onboardingCompleted?: boolean;
}) {
  const admin = getAdminClient();
  const normalizedEmail = options.email.toLowerCase();
  const fullName = options.fullName ?? "E2E Test User";
  const onboardingCompleted = options.onboardingCompleted ?? true;

  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: options.password,
    email_confirm: true,
    user_metadata: {
      role: options.role,
      full_name: fullName
    }
  });

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  if (!data.user) {
    throw new Error("Failed to create test user: Supabase returned no user.");
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email: normalizedEmail,
      full_name: fullName,
      role: options.role,
      onboarding_completed_at: onboardingCompleted ? new Date().toISOString() : null
    },
    { onConflict: "id" }
  );

  if (profileError) {
    throw new Error(`Failed to upsert test profile: ${profileError.message}`);
  }

  return data.user;
}

export async function deleteTestUser(userId: string) {
  const admin = getAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(`Failed to delete test user: ${error.message}`);
  }
}

export async function listTestUsers(emailPrefix = "e2e-"): Promise<User[]> {
  const admin = getAdminClient();
  const users: User[] = [];

  for (let page = 1; page < 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list test users: ${error.message}`);
    }

    const pageUsers = data.users ?? [];
    users.push(...pageUsers.filter((user) => user.email?.startsWith(emailPrefix)));

    if (pageUsers.length < 200) {
      break;
    }
  }

  return users;
}

export async function cleanupTestUsers(emailPrefix = "e2e-") {
  const users = await listTestUsers(emailPrefix);
  for (const user of users) {
    await deleteTestUser(user.id).catch(() => {});
  }
}
