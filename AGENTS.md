# Domus — Agent Operating Manual

This file is the permanent instruction set for all AI agents (Codex, Claude, Copilot) working on the Domus codebase. Read it in full before starting any task.

---

## 1. What Domus Is

Domus is a rental property management platform for small-portfolio landlords. It serves three user roles:

- **Owner**: Manages properties, units, leases, finances, documents, vendors, and ownership accounts (LLCs). Sees the full P&L.
- **Manager**: Operates assigned properties on behalf of the owner. Can manage leases, charges, maintenance, vendors, and tenant interactions — but only for properties they're assigned to.
- **Tenant**: Views their lease, pays rent (via Stripe), submits maintenance tickets, views/signs documents, and receives notifications.

The app is built for a real user (the repo owner) who manages real rental properties with a real property manager and real tenants. This is not a demo or tutorial project. Every feature must work end-to-end with real data.

### Tech Stack

| Layer | Technology |
|---|---|
| Web app | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| Mobile app | Expo / React Native, TypeScript |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Payments | Stripe (Checkout Sessions + Webhooks) |
| Email | Resend |
| Hosting | Vercel |
| Monorepo | npm workspaces (`@domus/web`, `@domus/mobile`, `@domus/shared`) |

### Repo Structure

```
apps/web/          — Next.js web application
apps/web/app/      — App Router pages and API routes
apps/web/components/dashboard/  — All dashboard UI sections
apps/web/lib/      — Data fetching, auth, Stripe, notifications, expenses, etc.
apps/mobile/       — Expo React Native app
packages/shared/   — Shared types and utilities
supabase/migrations/ — SQL migration files (applied to live DB by Claude)
scripts/           — Smoke tests, runtime verifiers, gate scripts
docs/              — Handoff docs, checklists, UAT guides
```

---

## 2. How Agents Collaborate

### Role Division

| Agent | Role | Handles |
|---|---|---|
| **Claude** | Architect + Reviewer | Plans features, designs DB schema, applies migrations to live Supabase via MCP, reviews Codex work, creates Codex task prompts |
| **Codex** | Executor | Writes app code, UI components, server actions, tests. Follows Claude's plans. Does NOT apply DB migrations. |
| **User** | Decision-maker | Approves plans, provides credentials, tests the app, sets priorities |

### Rules of Engagement

1. **Claude plans, Codex executes.** Do not design architecture or invent new features unless explicitly told to by the user. If a task feels ambiguous, build exactly what was specified and flag the ambiguity in your report.

2. **Do NOT include "Claude prompt" sections** in your handoff notes. Claude will review your work and decide next steps. Just report your compact status.

3. **Do NOT apply database migrations.** Write migration SQL files in `supabase/migrations/` as references, but the live Supabase database is managed exclusively by Claude via MCP. If your code needs a new table or column, document it clearly and Claude will create it.

4. **Scaffolding is not shipping.** If a feature's UI exists but isn't wired to real database tables, it is NOT done. Report it as `SCAFFOLDED`, not `WORKING`. The user cannot use a feature that saves to localStorage instead of the database.

5. **Every commit must pass gates.** After every batch of changes, run:
   ```bash
   npm run gate:web
   ```
   This runs: runtime verification, tests, lint, build, and mobile typecheck. Do not report "done" if the gate fails.

---

## 3. Coding Standards

### Server Actions (`apps/web/app/actions.ts`)

Every server action MUST follow this pattern in order:

```typescript
"use server";

export async function myAction(prevState: ActionState, formData: FormData): Promise<ActionState> {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. Validate input (Zod schema)
  const parsed = parseFormData(myActionSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  // 3. Check role
  const role = await getCurrentUserRole(user.id);
  if (!["owner", "manager"].includes(role)) return { error: "Unauthorized" };

  // 4. Check property-level permission
  const canAdmin = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdmin) return { error: "Access denied" };

  // 5. Check feature capability (if gated)
  const capError = await ensureCapabilityEnabled("documentsEnabled");
  if (capError) return capError;

  // 6. Execute mutation
  const { error } = await supabase.from("table").insert({...});
  if (error) return { error: error.message };

  // 7. Revalidate
  revalidatePath("/owner");
  return { success: "Record created." };
}
```

Never skip steps 1-4. Never trust client-side role checks alone.

### Data Fetching (`apps/web/lib/`)

- All data fetching functions go in `apps/web/lib/` (e.g., `portfolio.ts`, `expenses.ts`, `notifications.ts`)
- Always use the server-side Supabase client
- Handle missing tables gracefully — check for error codes `42P01` (undefined table), `42703` (undefined column), `PGRST205` (schema cache miss)
- Return empty arrays/defaults when tables don't exist, so the UI degrades gracefully

### Component Architecture

- Dashboard sections go in `apps/web/components/dashboard/`
- Each section is a self-contained component that receives data via props
- Server actions are passed as callbacks, never imported directly in client components
- Use the existing `StatefulAction` type for action props: `(prev: ActionState, data: FormData) => Promise<ActionState>`

### Error Handling

- Always return user-friendly error messages (not raw SQL errors)
- Detect schema errors (`42P01`, `42703`, `PGRST205`) and return "This feature requires a database update" instead of crashing
- Never swallow errors silently — log them or return them

### Validation

- All form inputs validated with Zod schemas in `apps/web/lib/validations.ts`
- Schema names follow pattern: `createXSchema`, `updateXSchema`, `deleteXSchema`
- Every schema has a corresponding test

---

## 4. Design Philosophy

### Visual Identity

Domus draws from **ancient Roman architecture** and the **Red Rising book series** aesthetic. The brand is:

- **Powerful but not aggressive** — like a Roman forum, not a battlefield
- **Premium and confident** — the user is proud to show this to their PM and tenants
- **Clean and functional** — every pixel serves a purpose

### Theme System

Three themes exist, all must be maintained:

| Theme | Feel |
|---|---|
| `Atlas Light` | Clean, professional, bright — the default |
| `Noctis Neon` | Dark mode with neon accents — for late-night management |
| `Imperium Night` | Subtle Roman-futurist palette — the signature Domus look |

When adding new UI, test it in all three themes. Dark themes need proper contrast — don't assume light backgrounds.

### UX Principles

1. **One thing at a time.** The dashboard uses focused mode — one section visible at a time, selected from the sidebar. Don't show everything at once.
2. **Guided workflows.** Complex operations (property setup, tenant onboarding, lease creation) should be step-by-step, not a wall of form fields.
3. **Hover explains, click acts.** Every clickable element should have a `title` attribute explaining what it does. Actions should be explicit buttons, not hidden gestures.
4. **Role-aware everything.** Never show a user something they can't act on. If a tenant can't edit a lease, don't show an edit button.
5. **Graceful degradation.** If a feature's database tables haven't been applied yet, show a clear message instead of crashing. Use the feature capability system.

---

## 5. Quality Requirements

### Definition of "Done"

A feature is done when ALL of these are true:

1. **Wired to real data** — reads from and writes to Supabase tables (not localStorage, not hardcoded, not mock data)
2. **Validated** — all inputs go through Zod schemas
3. **Permission-checked** — auth + role + property-level access verified
4. **Tested** — has test coverage in the existing test suite
5. **Themed** — works in all 3 themes without contrast issues
6. **Gated** — uses feature capability system if the table might not exist
7. **Gate passes** — `npm run gate:web` succeeds

### Self-Verification Checklist

Before reporting any batch as complete, verify:

- [ ] `npm run gate:web` passes
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] New server actions follow the 7-step pattern above
- [ ] New components receive data via props, not direct DB calls
- [ ] Error states render meaningful messages (not blank screens)
- [ ] Dark themes tested (check contrast manually or with tester preview)

### Reporting Format

After every task, report compact status. Example:

```
FEATURE_A_OK=true|false
FEATURE_B_OK=true|false
TESTS_PASS=true|false (X/X)
BUILD_PASS=true|false
GATE_PASS=true|false
SCHEMA_CHANGES_NEEDED=<none or list of tables/columns Claude needs to add>
```

If a feature is SCAFFOLDED (not wired to real DB), say so explicitly:
```
INBOX_WIRED=false (scaffolded — UI exists, using notifications table, not inbox_threads)
```

---

## 6. Database Conventions

### Tables Claude Manages

Do NOT create tables. If you need a new table or column:

1. Document what you need in your report: table name, columns, types, constraints, RLS policy intent
2. Claude will create the migration and apply it to live Supabase
3. Write your app code assuming the table WILL exist, and use feature capability gating to handle the case where it doesn't yet

### Existing Tables (for reference)

**Core:** `profiles`, `properties`, `units`, `leases`, `rent_charges`, `payments`
**Operations:** `maintenance_tickets`, `maintenance_assignments`, `maintenance_photos`, `vendors`
**Documents:** `document_templates`, `document_packets`, `document_signers`, `property_files`
**Notifications:** `notifications`, `notification_deliveries`
**Ownership:** `ownership_accounts`, `ownership_account_members`
**Finance:** `property_expenses`
**Leasing Pipeline:** `rental_listings`, `rental_applications`, `screening_reports`, `application_events`
**Inbox:** `inbox_threads`, `inbox_messages`, `message_deliveries`
**Automation:** `automation_templates`, `automation_rules`, `automation_runs`
**Auth:** `invitations`, `property_managers`

### RLS Pattern

All tables use Row Level Security. The three core permission functions are:

- `can_administer_property(property_id)` — owner or assigned manager
- `can_view_property(property_id)` — owner, manager, or tenant with active lease
- `can_access_property(property_id)` — alias for `can_view_property`

When writing app code, use `canUserAdministerProperty()` (TypeScript helper in `auth.ts`) for write operations and the appropriate Supabase query for reads (RLS handles filtering automatically).

---

## 7. Common Mistakes to Avoid

1. **localStorage instead of database.** If a feature needs persistence, it MUST go in Supabase. localStorage is only acceptable for client-side preferences (theme selection, sidebar state).

2. **Hardcoded data instead of queries.** Don't define template lists or category options in components. If it's in the database, query it. If it should be in the database, tell Claude to create the table.

3. **Skipping permission checks.** Every mutation needs auth + role + property access. No shortcuts.

4. **Scope creep without signaling.** If a task says "wire automations to DB," do exactly that. Don't also redesign the sidebar, add new workflow modes, or create new pages unless the task specifically asks for it. If you think something else should change, finish the assigned task first, then mention it in your report.

5. **Reporting "done" when scaffolded.** If the UI renders but the data isn't real, it's not done. Say SCAFFOLDED.

6. **Not testing dark themes.** New components often break in Noctis Neon and Imperium Night. Check contrast.

7. **Breaking the monorepo workspace names.** The workspaces are `@domus/web`, `@domus/mobile`, `@domus/shared`. Always use these names in npm commands.

8. **Committing without running the gate.** Every commit must pass `npm run gate:web`. No exceptions.

---

## 8. Environment Variables

The app expects these env vars (configured in Vercel):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CRON_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
```

Never hardcode these. Never commit `.env.local`. Reference them via `process.env.VAR_NAME`.

---

## 9. File Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Page | `apps/web/app/{route}/page.tsx` | `apps/web/app/owner/page.tsx` |
| API route | `apps/web/app/api/{name}/route.ts` | `apps/web/app/api/cron/generate-charges/route.ts` |
| Dashboard section | `apps/web/components/dashboard/{name}-section.tsx` | `automation-templates-section.tsx` |
| Data fetching | `apps/web/lib/{domain}.ts` | `apps/web/lib/expenses.ts` |
| Server actions | `apps/web/app/actions.ts` | Single file, organized by domain |
| Validation schemas | `apps/web/lib/validations.ts` | Single file |
| Tests | `apps/web/lib/__tests__/{name}.test.ts` | `feature-capabilities.test.ts` |
| Migration | `supabase/migrations/{date}_{description}.sql` | `20260302_phase10_leasing_inbox_automations.sql` |
| Scripts | `scripts/{name}.{sh,mjs}` | `scripts/gate-web.sh` |

---

## 10. The User

The owner of this project is a hands-on landlord who:

- Manages real properties with a real PM and real tenants
- Wants to use this app daily starting now
- Values reliability over flashiness — working features beat pretty scaffolding
- Likes the Red Rising / ancient Rome aesthetic
- Tests features himself and will tell you what's broken
- Expects clear, honest status reports — don't hide problems

Build for this person. Every feature should pass the test: "Can Courtney use this with his tenant and PM today?"
