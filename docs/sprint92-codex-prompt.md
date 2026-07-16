# Sprint 92 — In-App AI Assistant ("Ask Domus")

## 1. Objective

Add a floating "Ask Domus" AI chat widget to the owner and manager dashboards. The assistant answers natural language questions about the user's own property data (tenants, rent, leases, maintenance) using the Anthropic Claude API with streaming responses.

## 2. Context

- **Branch:** main
- **Production URL:** https://domusbase.com
- **Supabase project ID:** vawqdqkaguhdgfhdebqw

**Background:** This is a personal family-use app. The owner wants to ask plain-language questions about their portfolio — "Who hasn't paid this month?", "Any open maintenance tickets?" — and get instant answers without navigating to individual sections. The AI assistant fetches the user's live data server-side, builds a context prompt, and streams a response from Claude.

**Model:** `claude-haiku-4-5` — fast and cost-efficient for short Q&A interactions.

**Auth:** `ANTHROPIC_API_KEY` will be set by the user in Vercel environment variables after this sprint ships. The API route must handle the missing key gracefully with a friendly message instead of crashing.

**Dependency:** This sprint is explicitly approved to install `@anthropic-ai/sdk`.

## 3. In Scope

- Install `@anthropic-ai/sdk`
- API route: `POST /api/ai/chat` with auth guard, context building, and streaming
- Client component: floating chat widget with starter prompts and streaming display
- Wire the widget into the owner/manager dashboard via `next/dynamic`
- Add `ANTHROPIC_API_KEY` presence check to env status
- Unit tests for the API route (auth, role guard, rate limit, missing key)

## 4. Out of Scope

- Tenant dashboard — the AI assistant must NOT appear for tenant role
- Persistent chat history (no database storage of messages — session-only)
- File uploads or image analysis
- Changes to E2E test files
- Database migrations
- Deploy to production
- Changes to CLAUDE.md or AGENTS.md
- Any UI changes outside the AI assistant widget and its wiring point in `dashboard/index.tsx`

## 5. Exact Files Expected to Change

**Created:**
- `apps/web/app/api/ai/chat/route.ts`
- `apps/web/components/dashboard/ai-assistant.tsx`
- `apps/web/lib/__tests__/ai-assistant.test.ts`
- `apps/web/components/shared/domus-logo.tsx` — only if Sprint 91 has not yet created it; reference the `DomusLogo` component for the assistant avatar

**Modified:**
- `apps/web/components/dashboard/index.tsx` — add lazy-loaded `AiAssistant`
- `apps/web/lib/env.ts` (or equivalent env status file) — add `ANTHROPIC_API_KEY` check
- `apps/web/package.json` (root or `apps/web/`) — add `@anthropic-ai/sdk`

## 6. Implementation Requirements

### Part A: Install Dependency

```bash
npm install @anthropic-ai/sdk
```

Run from the repo root. Confirm it appears in `apps/web/package.json` or the root `package.json` depending on workspace structure.

### Part B: API Route — `apps/web/app/api/ai/chat/route.ts`

**Method:** POST
**Auth:** Server-side session required. Use the existing auth helper (e.g., `requireAuth()` or `createSupabaseServerClient()` + session check). If unauthenticated, return `401`.
**Role guard:** Only `owner` and `manager` roles may use this endpoint. If the user's role is `tenant`, return `403`.
**Rate limit:** Use the existing `checkRateLimit` from `@/lib/rate-limit`. Limit: 20 requests per user per hour. If exceeded, return `429` with a plain-language message: "You've sent a lot of messages. Try again in an hour."

**Request body:**
```typescript
{
  messages: { role: 'user' | 'assistant', content: string }[];
  accountId?: string;
}
```

Validate that `messages` is a non-empty array. If empty, return `400` with message: "Please send a message."

**Context building (server-side only — never exposed to client):**

Fetch the following from Supabase using the authenticated user's session. All queries must be scoped to the user's active account to prevent cross-account data leaks:

1. **Properties:** name, address, unit count
2. **Active leases:** tenant first name, rent amount, lease end date, property name
3. **Outstanding charges:** tenant name, amount due, days overdue (where status is not 'paid')
4. **Open maintenance tickets:** title, status, property name (where status is not 'completed' or 'closed')
5. **Recent payments:** tenant name, amount, date (last 30 days, paid status only)

Format this data as a readable text summary — not raw JSON — to minimize token usage. Example:

```
Properties (2):
- Oak Street House (3 units, 2 occupied)
- Maple Ave Condo (1 unit, 1 occupied)

Active Leases (3):
- Sarah T. — $1,500/mo — Oak Street — ends Aug 2026
- James R. — $1,200/mo — Oak Street — ends Dec 2025
- Maria L. — $2,100/mo — Maple Ave — ends Mar 2027

Outstanding Rent (1):
- James R. owes $1,200 — 12 days overdue

Open Maintenance Issues (2):
- "Leaky faucet" (in progress) — Oak Street
- "Broken heater" (new) — Maple Ave

Recent Payments (last 30 days, 2):
- Sarah T. paid $1,500 on Mar 15
- Maria L. paid $2,100 on Mar 1
```

**System prompt:**
```
You are Domus Assistant, a helpful property management AI for [owner first name].
You help them understand their rental portfolio.
Today is [current date in "March 27, 2026" format].

Here is their current portfolio data:
[formatted context summary]

Keep answers short and direct. Use plain language — write like you're texting a friend, not writing a report.
Only answer questions about the data shown above.
If you don't have the data to answer something, say so clearly — never make up numbers, names, or dates.
Never share sensitive financial details beyond what's in the summary above.
```

**Missing API key handling:** If `process.env.ANTHROPIC_API_KEY` is not set or is empty, do NOT throw an error. Return `200` with a plain text stream containing: "The AI assistant isn't set up yet. Ask your account owner to add the API key in settings."

**Streaming:** Use the Anthropic SDK's streaming API. Return a `ReadableStream` with `Content-Type: text/event-stream`. Stream the response as Server-Sent Events (SSE) or as raw text chunks compatible with the client fetch-based streaming approach below.

**Data privacy:** Never include in the AI context: SSNs, payment card numbers, bank account numbers, passwords, or any PII beyond first name + last initial for tenants.

### Part C: Client Component — `apps/web/components/dashboard/ai-assistant.tsx`

```tsx
"use client";
```

**Props:**
```typescript
interface AiAssistantProps {
  accountId: string;
  ownerName?: string;
}
```

**State:**
- `isOpen: boolean` — controls collapsed vs. expanded panel
- `messages: { role: 'user' | 'assistant', content: string }[]` — conversation history
- `input: string` — current text input value
- `isLoading: boolean` — true while waiting for or receiving a stream

**Collapsed state (default):**
A floating button fixed at `bottom-6 right-6` with:
- Purple gradient background (`from-violet-600 to-purple-700`)
- `shadow-lg rounded-2xl`
- A sparkle or chat icon (use a Lucide icon — `Sparkles` or `MessageCircle`)
- Label: "Ask Domus"

**Expanded state:**
A floating panel fixed at `bottom-6 right-6` with:
- Size: 360px wide, 480px tall on desktop
- Mobile: full width (`left-4 right-4`), positioned at bottom
- `rounded-2xl shadow-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700`

Panel structure:
1. **Header:** "Ask Domus" title (left) + X close button (right). Clicking X sets `isOpen = false`.
2. **Message list:** Scrollable area. Each message:
   - User messages: right-aligned, purple bubble (`bg-violet-600 text-white rounded-2xl rounded-br-sm px-4 py-2`)
   - Assistant messages: left-aligned, gray bubble (`bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl rounded-bl-sm px-4 py-2`), with a small `DomusLogo size="sm"` avatar to the left
   - Loading state: animated "..." dots in a gray bubble while streaming starts
3. **Starter prompts** (only shown when `messages` array is empty):
   - Four clickable chip buttons arranged in a 2×2 grid or wrapping row
   - Chips: "Who hasn't paid this month?", "Any open maintenance issues?", "What's my total overdue balance?", "When does my tenant's lease end?"
   - Clicking a chip populates the input and immediately sends the message
   - Style: `border border-gray-200 rounded-full px-3 py-1.5 text-sm hover:bg-gray-50`
4. **Input area:** Pinned at bottom of panel.
   - Text input (`placeholder="Ask anything about your properties..."`)
   - Send button (disabled when input is empty or `isLoading` is true)
   - Send on Enter key (but Shift+Enter inserts newline)

**Streaming implementation:**

Use `fetch` with the response body as a `ReadableStream`:

```typescript
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [...messages, userMessage], accountId }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();
let assistantContent = '';

// Add placeholder assistant message
setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  assistantContent += decoder.decode(value, { stream: true });
  // Update the last message in state with accumulated content
  setMessages(prev => [
    ...prev.slice(0, -1),
    { role: 'assistant', content: assistantContent }
  ]);
}
```

**Accessibility:**
- When the panel opens, focus moves to the text input
- Pressing Escape closes the panel and returns focus to the trigger button
- The panel has `role="dialog"` and `aria-label="Ask Domus"`
- The message list has `aria-live="polite"` so screen readers announce new messages

**Styling rules (§18 compliance):**
- All UI text follows plain language standard
- Button labels: "Send", "Close", "Ask Domus" — no jargon
- Error message if API fails: "Something went wrong. Try again."
- Empty state (no messages): "Ask me anything about your properties."

### Part D: Wire into Dashboard — `apps/web/components/dashboard/index.tsx`

Import with `next/dynamic` to prevent SSR and avoid impact on initial page load:

```typescript
const AiAssistant = dynamic(
  () => import('@/components/dashboard/ai-assistant').then(m => m.AiAssistant),
  { ssr: false }
);
```

Render at the bottom of the dashboard JSX, after all other content, outside any scrollable containers:

```tsx
{(userRole === 'owner' || userRole === 'manager') && (
  <AiAssistant accountId={activeAccountId} ownerName={firstName} />
)}
```

The component must render at the page root level (not inside a scroll container) so the fixed positioning works correctly.

### Part E: Environment Variable Check

**File:** `apps/web/lib/env.ts` (or wherever the env status object is defined)

Add to the env status check:
```typescript
ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
```

This allows the settings or debug pages to surface when the AI feature is configured.

### Part F: Unit Tests — `apps/web/lib/__tests__/ai-assistant.test.ts`

Write unit tests covering:

1. **Unauthenticated request** → API route returns `401`
2. **Tenant role** → API route returns `403`
3. **Empty messages array** → API route returns `400` with "Please send a message."
4. **Rate limit exceeded** → API route returns `429`
5. **Missing ANTHROPIC_API_KEY** → API route returns `200` with the friendly "not set up yet" message instead of throwing
6. **System prompt content** → when context data is provided, the system prompt includes property names and tenant data in the formatted summary

Mock the Supabase client and `checkRateLimit` in tests. Do not make real API calls to Anthropic in unit tests — mock the SDK.

## 7. Validation Commands to Run

```bash
npm install @anthropic-ai/sdk
npm run gate:web
```

Manual verification checklist (record results in report):
- [ ] Floating "Ask Domus" button visible in bottom-right of owner dashboard
- [ ] Clicking button opens chat panel
- [ ] Starter prompt chips appear when no messages exist
- [ ] Clicking a chip sends a message and receives a streaming response
- [ ] Typing a message and pressing Enter sends it
- [ ] Response streams character by character (not all at once)
- [ ] X button closes the panel
- [ ] Escape key closes the panel
- [ ] Tenant dashboard: AI widget is NOT present
- [ ] When ANTHROPIC_API_KEY is unset locally: friendly message returned, no crash

## 8. Acceptance Criteria

- [ ] Floating "Ask Domus" button appears in the bottom-right corner of the owner and manager dashboard
- [ ] Clicking the button opens the chat panel
- [ ] Starter prompt chips are shown when no conversation exists and clicking them sends the question
- [ ] User can type a question and receive a response that streams character by character
- [ ] The panel closes with the X button and with the Escape key
- [ ] Tenant dashboard does NOT show the AI assistant widget
- [ ] If `ANTHROPIC_API_KEY` is not set, the API returns a friendly "not configured yet" message — no 500 error, no crash
- [ ] The assistant widget is lazy-loaded via `next/dynamic` — zero impact on initial dashboard load
- [ ] All 6 unit tests pass
- [ ] `npm run gate:web` passes with zero errors
- [ ] No regressions to existing dashboard functionality (sidebar, account switcher, sections)
- [ ] The user should never need to read instructions to use the chat — the UI is self-explanatory

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: x/6 passing
AI_CHAT_WIDGET: working | broken
STREAMING: working | broken
AUTH_GUARD: working | broken
ROLE_GUARD: working | broken
RATE_LIMIT: working | broken
ENV_KEY_CHECK: added | missing
MISSING_KEY_HANDLED: graceful | crashes
GATE_PASSED: true | false
NOTES: [any issues]
```

## 10. Constraints

- MAY install `@anthropic-ai/sdk` — explicitly approved for this sprint
- Use `next/dynamic` with `{ ssr: false }` for the `AiAssistant` component — client-only rendering
- Do NOT stream or expose sensitive data in AI context: no SSNs, no payment card numbers, no bank accounts — only names, amounts, dates, statuses
- Do NOT modify E2E test files
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT deploy to production
- Do NOT create database migrations
- AI context fetch must be server-side only (inside the API route) — never fetch Supabase data from the client for AI purposes
- Use `checkRateLimit` from existing `@/lib/rate-limit` — do not implement a new rate limit system
- All UI text in the assistant must follow the §18 plain language standard: short sentences, no jargon, 6th-grade reading level
- The user should never need to read instructions to complete any action in the chat widget
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Report compact status only
