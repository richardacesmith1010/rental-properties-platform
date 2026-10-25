# Sprint 256c — Anthropic SDK security patch: @anthropic-ai/sdk ^0.99.0 (L2: dependency) — rev 1

## 1. Objective
`npm audit` (moderate): `@anthropic-ai/sdk 0.79.0 – 0.91.0` — "Memory Tool Path Validation Allows Sandbox Escape to
Sibling Directories" and "Insecure Default File Permissions in Local Filesystem Memory Tool". Domus does not use the
memory tool, but the package is in production. Move to the newest 0.x release (0.99.0), outside the affected range,
without the 1.x major.

## 2. Context
`apps/web/package.json`: `"@anthropic-ai/sdk": "^0.80.0"`. Only importer: `apps/web/app/api/ai/chat/route.ts`
(`new Anthropic({...})`, `anthropic.messages.create({ model: AI_MODEL, …, stream })` at lines ~200–204).

## 3. In scope
Set `"@anthropic-ai/sdk": "^0.99.0"`; `npm install` at the repo root. If the type of `messages.create` streaming or
its events changed so `route.ts` no longer typechecks, make the smallest change in `route.ts` that keeps behavior
identical, and list it.

## 4. Out of scope
The model id, prompts, streaming format sent to the browser, any other package.

## 5. Exact files expected to change
`apps/web/package.json`, `package-lock.json`, and only if required `apps/web/app/api/ai/chat/route.ts`.

## 6. Implementation requirements
Lines ≤ 140 characters. No behavior change.

## 7. Validation
```
npm ls @anthropic-ai/sdk --workspace apps/web
npm audit --omit=dev
cd apps/web && npx vitest run app/api/ai
```
then `npm run gate:web`.

## 8. Acceptance criteria
- A1 `npm ls` shows `@anthropic-ai/sdk@0.99.x` (one copy).
- A2 `npm audit --omit=dev` no longer lists `@anthropic-ai/sdk`.
- A3 Existing Ask Domus route tests pass unchanged; gate green (counts verbatim).

## 9. Report format
Compact status only: A1–A3, any route.ts change. Do NOT include 'Claude prompt' or 'recommended next steps for
Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no UI change).
Claude sends one Ask Domus question on production as the owner test account after deploy and checks a streamed reply.
