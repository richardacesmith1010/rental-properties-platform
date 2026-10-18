import type { FakeWorld } from "./fake-invite-db";

export const HANDLE_NEW_USER_SQL = `create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role text;
begin
  _role := coalesce(nullif(trim(new.raw_user_meta_data ->> 'role'), ''), 'tenant');
  if _role not in ('owner', 'manager', 'tenant') then
    _role := 'tenant';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    _role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  -- Owner invitations create membership in the target ownership account.
  insert into ownership_account_members (account_id, profile_id, member_role, active, can_receive_critical_alerts)
  select i.ownership_account_id, new.id, 'owner', true, true
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.role = 'owner'
    and i.ownership_account_id is not null
  on conflict (account_id, profile_id) do update
    set active = true,
        can_receive_critical_alerts = true;

  -- Manager invitations ensure active manager assignment.
  insert into property_managers (property_id, manager_profile_id, active)
  select i.property_id, new.id, true
  from invitations i
  where lower(i.email) = lower(new.email)
    and i.status = 'pending'
    and i.role = 'manager'
    and i.property_id is not null
  on conflict (property_id, manager_profile_id) do update
    set active = true;

  -- Auto-accept pending invitations for this email.
  update invitations
  set status = 'accepted',
      accepted_at = now(),
      invited_profile_id = new.id
  where lower(email) = lower(new.email)
    and status = 'pending';

  return new;
end;
$$;`;

type AuthUser = {
  id: string; email: string; email_confirmed_at: string | null; phone_confirmed_at: string | null;
  last_sign_in_at: string | null; invited_at: string | null;
  user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown>;
  token: string | null; sequence: number;
};
const authError = (code: string, status: number, message = code) => ({ code, status, message });

export async function runHandleNewUser(world: FakeWorld, user: AuthUser): Promise<void> {
  const saved = Object.fromEntries(Object.keys(world.tables).map((table) => [table, world.read(table)]));
  try {
    const rawRole = typeof user.user_metadata.role === "string" ? user.user_metadata.role.trim() : "";
    const role = ["owner", "manager", "tenant"].includes(rawRole) ? rawRole : "tenant";
    const fullName = user.user_metadata.full_name ?? user.email.split("@")[0];
    const existing = world.tables.profiles.find((profile) => profile.id === user.id);
    if (world.tables.profiles.some((profile) => profile.email === user.email && profile.id !== user.id)) {
      throw new Error("profiles_email_key");
    }
    if (existing) { existing.email = user.email; existing.full_name = fullName === "" ? existing.full_name : fullName; }
    else world.seed("profiles", { id: user.id, email: user.email, full_name: fullName, role });
    const pending = world.tables.invitations.filter((row) => row.email.toLowerCase() === user.email
      && row.status === "pending");
    for (const row of pending.filter((item) => item.role === "owner" && item.ownership_account_id)) {
      const member = world.tables.ownership_account_members.find((item) => item.account_id === row.ownership_account_id
        && item.profile_id === user.id);
      if (member) { member.active = true; member.can_receive_critical_alerts = true; }
      else world.seed("ownership_account_members", { account_id: row.ownership_account_id,
        profile_id: user.id, member_role: "owner", active: true, can_receive_critical_alerts: true });
    }
    let granted = 0;
    for (const row of pending.filter((item) => item.role === "manager" && item.property_id)) {
      if (world.guard("property_managers", { property_id: row.property_id })) throw new Error("property_managers_guard_client");
      world.upsertGrant(row.property_id, user.id, true);
      granted++;
    }
    for (const row of pending) { row.status = "accepted"; row.accepted_at = new Date().toISOString();
      row.invited_profile_id = user.id; }
    world.ops.push(`trigger.granted:${granted}`, `trigger.converted:${pending.length}`);
  } catch (error) {
    for (const table of Object.keys(saved)) world.tables[table] = saved[table];
    throw error;
  }
}

export function createFakeGoTrue(world: FakeWorld) {
  const users: AuthUser[] = [];
  const emails: Array<{ to: string; token: string }> = [];
  const calls: Array<{ method: string; email: string; options?: { data?: Record<string, unknown>; redirectTo?: string } }> = [];
  let commitError: { dropMarker?: boolean } | null = null;
  const normalize = (email: string) => email.toLowerCase();
  const find = (email: string) => users.find((user) => user.email === normalize(email));
  const insert = async (email: string, metadata: Record<string, unknown>, app: Record<string, unknown>,
    invited: boolean): Promise<AuthUser> => {
    const user: AuthUser = { id: crypto.randomUUID(), email: normalize(email), email_confirmed_at: null,
      phone_confirmed_at: null, last_sign_in_at: null, invited_at: invited ? new Date().toISOString() : null,
      user_metadata: metadata, app_metadata: app, token: null, sequence: 0 };
    await world.record("auth.insert", async () => { users.push(user); await runHandleNewUser(world, user); });
    return user;
  };
  const rotate = async (user: AuthUser) => {
    await world.record("auth.rotate", () => { user.invited_at = new Date().toISOString();
      user.token = `tok:${user.id}:${++user.sequence}`; });
  };
  const createUser = (params: { email: string; email_confirm: false;
    user_metadata: Record<string, unknown>; app_metadata?: Record<string, unknown> }) =>
    world.record("auth.createUser", async () => {
      if (world.consumeAuth("createUser")) return { data: { user: null },
        error: authError("unexpected_failure", 500) };
      if (find(params.email)) return { data: { user: null }, error: authError("email_exists", 422) };
      try {
        const app = commitError?.dropMarker ? {} : params.app_metadata ?? {};
        const user = await insert(params.email, params.user_metadata, app, false);
        if (commitError) { commitError = null; return { data: { user: null },
          error: authError("unexpected_failure", 500) }; }
        return { data: { user }, error: null };
      } catch {
        users.pop();
        return { data: { user: null }, error: authError("unexpected_failure", 500,
          "Database error saving new user") };
      }
    });
  const inviteCall = (method: "generateLink" | "inviteUserByEmail", email: string,
    options?: { data?: Record<string, unknown>; redirectTo?: string }) => world.record(`auth.${method}`, async () => {
    calls.push({ method, email: normalize(email), options });
    if (world.consumeAuth(method)) return { data: { user: null }, error: authError("unexpected_failure", 500) };
    let user = find(email);
    if (user?.email_confirmed_at || user?.phone_confirmed_at) {
      return { data: { user: null }, error: authError("email_exists", 422) };
    }
    try {
      if (!user) user = await insert(email, options?.data ?? {}, {}, true);
      await rotate(user);
      if (method === "inviteUserByEmail") {
        await world.record("auth.email", () => { emails.push({ to: normalize(email), token: user!.token! }); });
        return { data: { user }, error: null };
      }
      return { data: { user, properties: { action_link: `fake-link:${user.token}`,
        hashed_token: user.token } }, error: null };
    } catch {
      if (user && !world.tables.profiles.some((profile) => profile.id === user!.id)) users.pop();
      return { data: { user: null }, error: authError("unexpected_failure", 500,
        "Database error saving new user") };
    }
  });
  const admin = {
    createUser,
    generateLink: (params: { type: string; email: string;
      options?: { data?: Record<string, unknown>; redirectTo?: string } }) =>
      inviteCall("generateLink", params.email, params.options),
    inviteUserByEmail: (email: string, options?: { data?: Record<string, unknown>; redirectTo?: string }) =>
      inviteCall("inviteUserByEmail", email, options),
    getUserById: (id: string) => world.record("auth.getUserById", () => {
      if (world.consumeAuth("getUserById")) {
        return { data: { user: null }, error: authError("unexpected_failure", 500) };
      }
      const user = users.find((item) => item.id === id) ?? null;
      return { data: { user }, error: user ? null : authError("user_not_found", 404) };
    }),
    deleteUser: (_id: string) => world.record("auth.deleteUser", () => ({ data: { user: null },
      error: authError("disabled", 403) }))
  };
  Object.assign(world.admin.auth.admin, admin);
  return {
    users, emails, calls, ...admin,
    commitThenError: (options?: { dropMarker?: boolean }) => { commitError = options ?? {}; },
    selfSignUp: async (email: string, metadata: { role: string; full_name?: string }) => {
      if (find(email)) return null;
      try { return await insert(email, metadata, {}, false); } catch { users.pop(); return null; }
    },
    dropAuthUser: (id: string) => { const at = users.findIndex((user) => user.id === id);
      if (at >= 0) users.splice(at, 1); },
    setAuthEmail: (id: string, email: string) => { const user = users.find((item) => item.id === id);
      if (user) user.email = normalize(email); },
    clickLink: (token: string) => { const user = users.find((item) => item.token === token);
      if (!user) return false;
      user.email_confirmed_at = new Date().toISOString(); user.last_sign_in_at = new Date().toISOString();
      user.token = null;
      return true;
    }
  };
}
