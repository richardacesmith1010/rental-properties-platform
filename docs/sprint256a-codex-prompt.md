# Sprint 256a — Security patch bumps: Next.js 15.5.28 (critical RCE) and Zod 4.6.6 (L2: dependencies) — rev 1

## 1. Objective
`npm audit` (2026-10-23) on production dependencies: **critical** Next.js "Unauthenticated Remote Code Execution in
Image Optimization API when SVG files are used" (GHSA-2464-fhr4-w9xw) and **high** "Denial of Service in App Router
using Server Actions" (GHSA-p3m5-59mp-jv5r), both fixed in `next@15.5.28`; **high** Zod "can exhaust memory while
validating oversized constrained collections" (GHSA-mrhx-c7xc-m3w5), fixed in `zod@4.6.6`. Apply only these patch
bumps.

## 2. Context
`apps/web/package.json`: `"next": "15.5.27"`, `"eslint-config-next": "15.5.27"`, `"zod": "^4.3.6"` (installed
4.6.5). Root `package-lock.json` (npm workspaces).

## 3. In scope
Set `next` and `eslint-config-next` to exactly `15.5.28`; set `zod` to `^4.6.6`. Run `npm install` at the repo root so
`package-lock.json` resolves `next@15.5.28` and `zod@4.6.6` (or newer 4.x patch). No other dependency changes.

## 4. Out of scope
`@supabase/supabase-js`, `@anthropic-ai/sdk`, `tailwindcss`, any other package, any source change.

## 5. Exact files expected to change
`apps/web/package.json`, `package-lock.json`.

## 6. Implementation requirements
If the gate fails because of the bump, fix only what the new versions require and list each change; if that needs a
source file, stop and report instead.

## 7. Validation
```
npm ls next zod --workspace apps/web
npm audit --omit=dev --workspace apps/web
```
then `npm run gate:web`.

## 8. Acceptance criteria
- D1 `npm ls` shows `next@15.5.28` and `zod@4.6.6+` (one copy each in the app tree).
- D2 `npm audit --omit=dev` no longer lists the `next` critical/high or `zod` high advisories (report the remaining list).
- D3 Gate green (counts verbatim).

## 9. Report format
Compact status only: D1–D3, remaining audit list. Do NOT include 'Claude prompt' or 'recommended next steps for
Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow (no UI change).
