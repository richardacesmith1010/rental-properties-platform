# Sprint 257a — Ask Domus: calm message + one platform alert when the AI provider is unavailable (L2) — rev 1

## 1. Objective
2026-10-24 Ask Domus went down: every question returned 500 "Something went wrong. Try again." Vercel log:
`Ask Domus chat error: Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit
balance is too low to access the Anthropic API…"}}`. Nobody was told. When the provider (not our code) is the
problem, users should see a calm message, and the owner should get one email.

## 2. Context
- `apps/web/app/api/ai/chat/route.ts:200-245`: `anthropic.messages.create({ …, stream: true })`; outer `catch` logs
  and returns 500 `{ error: "Something went wrong. Try again." }`; the stream's inner `catch` enqueues the same text.
- `apps/web/lib/platform-alerts.ts:18` `sendPlatformAlert({ subject, body, dedupeKey })` (emails
  `PLATFORM_ALERT_EMAIL`, de-dupes per key for 1 hour per instance). Existing use: `lib/charge-checkout.ts:73`
  (`void sendPlatformAlert(...)`).
- The browser (`components/dashboard/ai-assistant.tsx:144-150`) already shows the server's JSON `error` string.
- Tests: `apps/web/app/api/ai/chat/__tests__/consent.test.ts`.

## 3. In scope
1. In `route.ts`, add a small classifier `providerUnavailableKind(error): "billing" | "auth" | "rate_limit" |
   "overloaded" | "connection" | null` using the SDK's error classes/fields (`Anthropic.APIError` `status`,
   `error.error.type`, message; `Anthropic.APIConnectionError` / `APIConnectionTimeoutError`):
   - `billing`: status 400 with message containing "credit balance" (case-insensitive), or status 402;
   - `auth`: status 401 or 403;
   - `rate_limit`: status 429;
   - `overloaded`: status 529, or 500–504 from the provider;
   - `connection`: connection / timeout errors;
   - anything else → `null` (our bug: keep today's 500 and message).
2. When the kind is not null (from `messages.create` **or** during the stream): reply
   `503 { error: "Ask Domus is resting. Try again later." }` (mid-stream: enqueue that exact text instead of the
   generic one), log `console.error("Ask Domus provider unavailable:", kind, status, requestId)`, and
   `void sendPlatformAlert({ subject: "Ask Domus is unavailable", body: "<kind> — status <status>, request
   <requestId>, <ISO time>. Users see: Ask Domus is resting.", dedupeKey: "ask-domus-provider:<kind>" })`.
   The alert body must not include the user's question, name, email or any account data.
3. `null` kind: behavior unchanged (500 + "Something went wrong. Try again.", no alert).

## 4. Out of scope
The model id, prompts, consent flow, the browser component, the alert helper, retries.

## 5. Exact files expected to change
- `apps/web/app/api/ai/chat/route.ts`
- `apps/web/app/api/ai/chat/__tests__/provider-unavailable.test.ts` (new)

## 6. Implementation requirements
Exact copy as above. No `expect` inside mocks (L-028). Lines ≤ 140 characters. Plain-language guard passes.

## 7. Validation
```
cd apps/web
npx vitest run app/api/ai/chat
```
then from the repo root `npm run gate:web`.

## 8. Acceptance criteria
- P1 Table test of the classifier: credit-balance 400 → billing; 402 → billing; 401/403 → auth; 429 → rate_limit;
  529, 500, 503 → overloaded; connection and timeout errors → connection; a 400 "messages: field required" → null; a
  plain `TypeError` → null.
- P2 `messages.create` rejecting with the credit-balance error → response 503 with exactly
  `{ error: "Ask Domus is resting. Try again later." }`; `sendPlatformAlert` called once with subject
  "Ask Domus is unavailable", `dedupeKey: "ask-domus-provider:billing"`, and a body that does not contain the user's
  message text.
- P3 A stream that throws an overloaded error mid-way → the streamed text ends with
  "Ask Domus is resting. Try again later."; one alert with `dedupeKey: "ask-domus-provider:overloaded"`.
- P4 A non-provider error → 500 `{ error: "Something went wrong. Try again." }` and **no** alert.
- P5 Existing consent tests pass unchanged; gate green (counts verbatim).

## 9. Report format
Compact status only: P1–P5 → test names, counts. Do NOT include 'Claude prompt' or 'recommended next steps for
Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow: when the AI
is down they see a calm, short message. Claude checks it live on production (the provider is out of credits today):
the reply is the new message and exactly one alert email is attempted (Vercel log).
