# Domus reference: verification, test accounts, plain language

Moved out of CLAUDE.md on 2026-10-14 to keep per-turn context small. Read when planning UI work or walking a flow.

## 18) Zero Friction Design Principle (Hard Rule)

Humans are lazy. Every additional step, every extra click, every moment of confusion increases friction and causes users to quit or ask questions. Claude must apply this principle to every sprint plan, every feature design, and every UX decision.

### Core Rule

**If a user has to think about what to do next, the design has failed.** The system should guide them through a single obvious path with zero ambiguity.

### Application to Sprint Planning

Before writing any Codex prompt that involves user-facing features, Claude must ask:

1. **How many steps does this require from the user?** If more than 2, find a way to reduce.
2. **Does the user need to copy/paste anything?** If yes, can we eliminate it with a link or auto-fill?
3. **Does the user need to navigate somewhere else?** If yes, can we bring them there automatically?
4. **Does the user need to understand a concept?** If yes, can we make it self-explanatory through UI?
5. **Is there a code, token, or ID the user needs to enter?** If yes, replace with a magic link.
6. **Could this entire flow be a single button click?** If yes, make it one.

### Plain Language Rule (Hard Rule)

Most Americans read below an 8th grade level. ALL user-facing text in Domus must be written for a 6th grader. This applies to:

- Button labels
- Form labels and placeholders
- Error messages
- Email notifications
- Onboarding text
- Help text
- Section names
- Confirmation messages

**Rules:**
1. **No jargon.** "Charge" → "Rent". "Submit" → "Send". "Delinquency" → "Overdue". "Reconciliation" → never use this word.
2. **Short sentences.** Max 12 words per sentence in UI text. If you need more, split into two.
3. **Common words only.** If a word wouldn't appear in a 5th grader's vocabulary, replace it.
4. **Verbs over nouns.** "Pay Rent" not "Payment Processing". "Report a Problem" not "Maintenance Ticket Submission".
5. **Tell them what happens.** "You'll get a receipt by email" not "A confirmation will be dispatched to your registered email address."
6. **No acronyms without explanation.** First use: "LLC (a type of business account)". After that: "LLC" is fine.
7. **Test it:** Read every piece of UI text out loud. If it sounds like a lawyer wrote it, rewrite it.

**Word replacements (enforced in all Codex prompts):**

| Never use | Use instead |
|---|---|
| Charge | Rent (for tenants), Payment (for owners) |
| Submit | Send |
| Maintenance Ticket | Problem / Issue |
| Delinquency | Overdue |
| Disbursement | Payout |
| Reconciliation | (don't use — explain the concept instead) |
| Remittance | Payment |
| Acknowledgment | Confirmation |
| Terminate | End |
| Commence | Start |
| Pursuant to | Based on |
| Herein | (delete) |
| Utilize | Use |
| Facilitate | Help |
| Subsequent | Next |
| Prior to | Before |
| Inquire | Ask |
| Endeavor | Try |

### Examples

- **BAD**: "Share this join code with your siblings. They'll need to create an account, go to Settings, find the LLC section, and enter the code." (5 steps, requires explanation)
- **GOOD**: "Enter your siblings' emails. They'll get a link. One click → account created → they're in." (1 step for owner, 1 click for invitee)

- **BAD**: "Go to stripe.com, create an account, find your API key, copy it, go to Vercel, find environment variables, paste it." (7 steps)
- **GOOD**: Claude navigates to the page, fills everything possible, asks user for ONE thing: "Paste your API key here."

- **BAD**: A settings page with 15 options and no guidance on what to do first.
- **GOOD**: A setup wizard that asks one question at a time and auto-advances.

### Friction Checklist (Run Before Every Sprint)

- [ ] Can any manual step be automated?
- [ ] Can any multi-step process become a single action?
- [ ] Can any code/token entry be replaced with a magic link?
- [ ] Can any navigation be replaced with a direct link or auto-redirect?
- [ ] Can any form be pre-filled with known data?
- [ ] Would a first-time user know exactly what to do without instructions?
- [ ] Is there a simpler way to achieve the same outcome?

### For Codex Prompts

Every Codex prompt for user-facing features must include this constraint:
> "The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the user needs to think about what to do, the UI needs to be clearer."

## 19) Sprint Verification Protocol (Hard Rule)

After every sprint, Claude must verify the change works for a real user — not just that tests pass. The verification method depends on what the sprint changed. This is not optional.

### For UI Sprints (Mandatory Flow Walk-Through)

If the sprint modifies any `.tsx` file in `components/`, any `page.tsx`, any user-facing copy, or any modal/wizard/form behavior, Claude must:

1. **Walk the affected flow end-to-end via Chrome MCP** using a designated test account (see Test Accounts below). Exercise every changed interaction as a real user would — log in, navigate, click, fill, submit, observe.
2. **Single-point-of-failure interrupts only.** Claude pings the user only for actions Claude genuinely cannot do: passwords, real money authorization, OAuth flows, real bank or ID information. For everything else — navigation, button clicks, form fills with known values, screenshot inspection — Claude proceeds without asking. The user expects to be pinged as many times as needed for genuine SPOFs, and to be left alone otherwise.
3. **At each step, take screenshots in both light and dark mode** and verify:
   - All text is readable against its background (WCAG AA minimum)
   - Status badges, buttons, and interactive elements have sufficient contrast
   - No content is invisible, clipped, or overlapping
   - Modals/wizards are centered, scrollable, and dismissible
   - Empty states show appropriate content (not blank areas)
   - Responsive layout works at expected widths
4. **Verify behavior matches acceptance criteria** by exercising the new behavior in the actual flow, not just by reading the diff. A passing test suite is necessary but not sufficient.
5. **Report findings** — any issues found go into the next sprint prompt.
6. **Production-breaking issues are URGENT** — trigger an immediate hotfix sprint.

### For Backend-Only Sprints (Verification Commands)

If the sprint modifies only server actions, API routes, cron jobs, webhook handlers, library code with no UI surface, or migrations, Claude must:

1. **Run verifications directly when possible** — via Bash, Supabase MCP, direct API calls — and report the actual response. Do not delegate to the user what Claude can do.
2. **Provide explicit verification steps** when delegation is needed:
   - Exact `curl` commands with expected response shape
   - Exact SQL queries with expected row state
   - Exact log patterns to grep for after triggering the code path
3. **Only delegate verification to the user** when it requires real production data Claude shouldn't access (real tenant payments, real bank balances, etc.).

### Test Accounts

Dedicated test accounts must exist for every role. Claude uses these for flow walks; production user data is never used for testing.

| Role | Email | Status |
|---|---|---|
| Tenant (real data) | richard.ace.smith+alt@gmail.com | No lease. Its ended "1st Home" test lease and the Sprint 128 $5 Stripe charge/payment were deleted 2026-10-10 at the owner's request (Domus now differs from Stripe by that $5 test). |
| Tenant (dry run) | richard.ace.smith+drytenant@gmail.com | Active — Smoke Test Property Unit D, $25/mo from 2026-11-01 (first-tenant dry run). Owner holds the password; Claude walks it only via the owner's logged-in browser. |
| Owner (smoke) | richard.ace.smith+smokeowner@gmail.com | Active — isolated smoke graph (Sprint 130) |
| Manager (smoke) | richard.ace.smith+smokemanager@gmail.com | Active — assigned to Smoke Test Property only |
| Tenant (smoke) | richard.ace.smith+smoketenant@gmail.com | Active — $1/mo lease (below online-payment minimum) |

Smoke-account credentials live in `apps/web/.env.local` (`SMOKE_*` vars, gitignored); rotation procedure in `docs/smoke-accounts.md`. With those vars set, `APP_URL=https://domusbase.com npm run smoke:web` runs authenticated render checks (3 roles, zero-console-error assertion) — this satisfies the L-009 post-deploy render check for routine deploys; manual Chrome walks remain required for sprints that change specific flows.

If a required test account is missing for a planned flow walk, Claude must request its creation as part of that sprint's scope rather than skipping verification.

### What Counts as Production-Breaking

- Text invisible against background (white on white, etc.)
- Page renders blank or mostly empty
- Primary action buttons not visible without scrolling
- Forms that can't be submitted (focus bugs, scroll bugs)
- Content that can't be reached (no scroll, clipped off-screen)
- Server actions that fail silently (no user feedback, no error logged)
- Critical flows where the user receives a generic error masking the real failure (see L-008 — Sprint 118's categorized errors are the pattern)

