import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PROFILE_COMPLETED_AT = "2026-07-17T00:00:00.000Z";

export function deterministicUuid(label) {
  const hex = createHash("sha1").update(`domus:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = hex.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-` +
    `${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

export function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

export function createAdminClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function createSummary() {
  return {
    created: [],
    updated: [],
    existing: []
  };
}

export function record(summary, status, label) {
  summary[status].push(label);
}

export function printSummary(summary, prefix = "[smoke-seed]") {
  for (const status of ["created", "updated", "existing"]) {
    const items = summary[status];
    if (items.length > 0) {
      console.log(`${prefix} ${status}: ${items.join(", ")}`);
    }
  }
}

export function fail(step, error, prefix = "[smoke-seed]") {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${prefix} ${step} failed: ${message}`);
  process.exit(1);
}

export async function listTargetUsers(admin, emails) {
  const remaining = new Set(emails);
  const usersByEmail = new Map();

  for (let page = 1; page <= 50 && remaining.size > 0; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const users = data.users ?? [];
    for (const user of users) {
      const email = user.email?.toLowerCase();
      if (email && remaining.has(email)) {
        usersByEmail.set(email, user);
        remaining.delete(email);
      }
    }

    if (users.length < 200) {
      break;
    }
  }

  return usersByEmail;
}

export async function ensureProfile(admin, user, spec, summary, completedAt = PROFILE_COMPLETED_AT) {
  const { data: existingProfile, error: lookupError } = await admin
    .from("profiles")
    .select("id, email, full_name, role, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to look up ${spec.role} profile: ${lookupError.message}`);
  }

  const expectedProfile = {
    id: user.id,
    email: spec.email,
    full_name: spec.fullName,
    role: spec.role,
    onboarding_completed_at: completedAt
  };

  if (!existingProfile) {
    const { error } = await admin.from("profiles").insert(expectedProfile);
    if (error) {
      throw new Error(`Failed to create ${spec.role} profile: ${error.message}`);
    }

    record(summary, "created", `${spec.role} profile`);
    return;
  }

  const needsProfileUpdate =
    existingProfile.email?.toLowerCase() !== spec.email ||
    existingProfile.full_name !== spec.fullName ||
    existingProfile.role !== spec.role ||
    existingProfile.onboarding_completed_at !== completedAt;

  if (!needsProfileUpdate) {
    record(summary, "existing", `${spec.role} profile`);
    return;
  }

  const { error } = await admin
    .from("profiles")
    .update({
      email: expectedProfile.email,
      full_name: expectedProfile.full_name,
      role: expectedProfile.role,
      onboarding_completed_at: expectedProfile.onboarding_completed_at
    })
    .eq("id", user.id);
  if (error) {
    throw new Error(`Failed to align ${spec.role} profile: ${error.message}`);
  }

  record(summary, "updated", `${spec.role} profile`);
}

export async function ensureOwnerMembership(admin, accountId, ownerProfileId, summary) {
  const membership = {
    account_id: accountId,
    profile_id: ownerProfileId,
    member_role: "owner",
    can_receive_critical_alerts: true,
    active: true
  };

  const { data: existingMembership, error: lookupError } = await admin
    .from("ownership_account_members")
    .select("account_id, profile_id, member_role, can_receive_critical_alerts, active")
    .eq("account_id", accountId)
    .eq("profile_id", ownerProfileId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to look up ownership membership: ${lookupError.message}`);
  }

  if (!existingMembership) {
    const { error } = await admin.from("ownership_account_members").insert(membership);
    if (error) {
      throw new Error(`Failed to create ownership membership: ${error.message}`);
    }

    record(summary, "created", "ownership membership");
    return;
  }

  const needsUpdate =
    existingMembership.member_role !== membership.member_role ||
    existingMembership.can_receive_critical_alerts !== membership.can_receive_critical_alerts ||
    existingMembership.active !== membership.active;

  if (!needsUpdate) {
    record(summary, "existing", "ownership membership");
    return;
  }

  const { error } = await admin
    .from("ownership_account_members")
    .update({
      member_role: membership.member_role,
      can_receive_critical_alerts: membership.can_receive_critical_alerts,
      active: membership.active
    })
    .eq("account_id", accountId)
    .eq("profile_id", ownerProfileId);

  if (error) {
    throw new Error(`Failed to align ownership membership: ${error.message}`);
  }

  record(summary, "updated", "ownership membership");
}

export class SeedRefusedError extends Error {
  constructor(rule) { super(rule); this.name = "SeedRefusedError"; }
}

export function sha256Hex(value) { return createHash("sha256").update(value).digest("hex"); }

export function readOnlyClient(admin) {
  const forbidden = () => { throw new Error("dry run attempted a write"); };
  const wrapQuery = (query) => new Proxy(query, { get(target, key) {
    if (["insert", "update", "upsert", "delete"].includes(key)) return forbidden;
    const value = target[key];
    if (typeof value !== "function") return value;
    return (...args) => {
      const next = value.apply(target, args);
      return next && typeof next === "object" && typeof next.eq === "function" ? wrapQuery(next) : next;
    };
  } });
  return {
    ...admin,
    from(table) { return wrapQuery(admin.from(table)); },
    rpc: forbidden,
    auth: { admin: new Proxy(admin.auth.admin, { get(target, key) {
      if (["createUser", "updateUserById", "inviteUserByEmail", "generateLink"].includes(key)) return forbidden;
      return target[key];
    } }) },
    storage: { from(bucket) {
      const storage = admin.storage.from(bucket);
      return new Proxy(storage, { get(target, key) {
        if (["upload", "remove", "update", "move", "copy"].includes(key)) return forbidden;
        return target[key];
      } });
    } }
  };
}

function sameSeedValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameSeedValue(value, right[index]));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && sameSeedValue(left[key], right[key]));
}

export async function ensureRowById(admin, table, expected, owns, summary, label, dryRun = false) {
  const { data: row, error } = await admin.from(table).select("*").eq("id", expected.id).maybeSingle();
  if (error) throw new Error(`Failed to read ${label}: ${error.message}`);
  if (row && !owns(row)) throw new SeedRefusedError(`foreign ${label} at demo id ${expected.id}`);
  const diff = row && Object.fromEntries(Object.entries(expected).filter(([key, value]) =>
    !sameSeedValue(row[key], value)));
  if (!row) {
    if (!dryRun) {
      const result = await admin.from(table).insert(expected);
      if (result.error) throw new Error(`Failed to create ${label}: ${result.error.message}`);
    }
    record(summary, dryRun ? "would-create" : "created", label);
  } else if (Object.keys(diff).length) {
    if (!dryRun) {
      const result = await admin.from(table).update(diff).eq("id", expected.id);
      if (result.error) throw new Error(`Failed to update ${label}: ${result.error.message}`);
    }
    record(summary, dryRun ? "would-update" : "updated", label);
  } else record(summary, "existing", label);
  return row ?? expected;
}
