# Sprint 174 — Security: upgrade to supported Next.js 15.5.27 + React 19, and fix dependencies (L3) · Category 6: Security & privacy

Revision 3 — ChatGPT verdict APPROVE WITH CHANGES on rev 2. Both changes are adopted: codemods pinned to Next 15, and a required caching inventory. Earlier: ChatGPT rejected rev 1 (Next 14.2.35). Claude verified against the GitHub advisory database on 2026-10-05:
- Next.js 14 is end-of-life;
- critical advisories published 2026-09-08 (one is CVE-2026-75604) affect `next >=13.4.0 <15.5.24`, with no 14.x fix;
- high advisories from 2026-07-22 affect `<15.5.21`.

The target is therefore the supported 15.5 line: **15.5.27**.

## 1. Objective
Move the web app to `next@15.5.27`, the React 19 it requires, and matching dependencies, with **no behaviour change**. Then apply every non-breaking dependency fix, so the web production dependencies have 0 critical advisories and no high advisory except the documented build-time Tailwind-4-only chain.

## 2. Context
- Branch `main`, HEAD at or after the commit adding this revision. The app uses the Next.js App Router and is deployed on Vercel. It uses `@supabase/ssr` cookies, middleware (`apps/web/middleware.ts`), server actions, route handlers, Sentry, Playwright and Vitest.
- Today `apps/web/package.json` pins `next` 14.2.5, `eslint-config-next` 14.2.5, `react`/`react-dom` 18.3.1 and `@types/react` 18.3.12.
- Next 15 breaking changes that apply here:
  - `cookies()`, `headers()` and `draftMode()` are async (about 4 files);
  - page/layout `params` and `searchParams` are Promises (about 21 `page.tsx`/`route.ts` files);
  - fetch and GET route handlers are no longer cached by default;
  - React 19: `useFormState` is renamed to `useActionState` (the old name still works with a warning; prefer `useActionState` where it is touched), ref-as-prop typing, stricter types.
- Use the **Next 15-specific** codemods only. Do **not** run `@next/codemod@latest upgrade latest`, which can target Next 16.
  - Run the version-pinned transforms, for example `npx @next/codemod@15 next-async-request-api .`, plus the React 19 types codemod if needed.
  - Then explicitly install `next@15.5.27` and fix the rest by hand.
- The repo is an npm workspace with `apps/mobile`, a stale Expo app on React 18.3.1. **Do not change `apps/mobile`.** Make sure the web workspace resolves React 19 while mobile keeps its own React 18; npm may nest them. Mobile's own typecheck in the gate must still pass.
- After the Next upgrade, `npm audit --omit=dev` (web) still shows non-breaking high fixes for: `axios`, `brace-expansion`, `browserslist`, `fast-glob`, `form-data`, `glob`, `globby`, `js-yaml`, `minimatch`, `nanoid`, `picomatch`, `source-map-js`, `ws`.
- The Tailwind-4-only chain (`tailwindcss`, `braces`, `chokidar`, `micromatch`) is build-time only, accepted, and **out of scope**.

## 3. In scope
1. Upgrade `next` and `eslint-config-next` to `15.5.27`, `react`/`react-dom` to the React 19 version Next 15.5.27 expects, and `@types/react`/`@types/react-dom` to match. Use the same pin style as today.
2. Run the codemods, then fix every compile, type, lint and test failure: async request APIs, `params`/`searchParams` Promises, React 19 types, and any library peer issues.
   - **Caching inventory (required):** Next 15 changes the defaults for uncached server `fetch()`, GET route handlers, and the client router cache (`staleTimes`). List:
     (a) every server-side `fetch()` without explicit `cache`/`next.revalidate`;
     (b) every GET route handler and whether it was implicitly cached under Next 14;
     (c) any flow relying on client router cache reuse, for example the owner section cache with `history.replaceState`, back/forward, and `router.refresh()`.
   - For each one, keep the Next 14 behaviour explicitly (for example `export const dynamic`, `cache: "force-cache"`, or `experimental.staleTimes` in `next.config`), or state why the change cannot affect behaviour.
   - Most pages already use `dynamic = "force-dynamic"`; keep them.
3. Upgrade only those libraries that **must** move for React 19 / Next 15 compatibility, for example `@testing-library/react`, `@sentry/nextjs` or `sonner`, if their current versions reject React 19. List each one with the reason.
4. Run `npm audit fix` (never `--force`) for the remaining non-breaking fixes. Revert any lockfile change that alters `apps/mobile`'s resolved versions.
5. Re-run `npm audit --omit=dev` in `apps/web` and report the result.

## 4. Out of scope
- Next 16, Tailwind 4, any feature or copy change, `apps/mobile`.
- DB and Supabase settings (Claude does those), deploy.
- `.claude/launch.json`, `docs/`, `CLAUDE.md`, `AGENTS.md`.

## 5. Exact files expected to change
- `apps/web/package.json`, `package-lock.json`.
- The source and test files the upgrade forces: the codemod output plus manual fixes, expected mainly in `apps/web/app/**/page.tsx`, `layout.tsx`, `route.ts`, `apps/web/lib/supabase/*`, `apps/web/middleware.ts` and server actions using `cookies()`/`headers()`.
- No behaviour or copy changes. Every changed file must be explained by an upgrade-forced reason; give the category per file group in the report.

## 6. Implementation requirements
- Auth, role and permission checks must be byte-for-byte equivalent in logic. Only `await` placement may change.
- Supabase SSR cookie handling must keep working: server components read, server actions and route handlers write.
- `redirect()`/`notFound()` must never be wrapped in a try/catch that swallows them (keep the Sprint 171 rule).
- Each line at most 140 characters. Do not compact code (L-015).

## 7. Validation commands to run
- `npm run gate:web` (full: tests, lint, typecheck, build, mobile typecheck)
- `cd apps/web && npm audit --omit=dev`
- `node -e "console.log(require('next/package.json').version, require('react/package.json').version)"` from `apps/web`

## 8. Acceptance criteria (binary)
1. `apps/web` resolves `next` 15.5.27 and React 19.x. `eslint-config-next` is 15.5.27.
2. `npm audit --omit=dev` (web) shows **0 critical**. Any remaining high is only the Tailwind-4-only chain, or is named with "no non-breaking fix".
3. `npm run gate:web` passes, including the existing auth, server action, route handler and component tests (1,372+). No test is deleted or skipped to pass. If a test needed changing for React 19 / Next 15 APIs, list it with the reason.
4. `apps/mobile/package.json` is unchanged, and mobile's resolved versions in the lockfile are unchanged. The mobile typecheck passes.
5. A grep shows no remaining synchronous `cookies()`/`headers()` use, and no un-awaited `params`/`searchParams` access in `apps/web/app`.
6. The report lists every changed file with its reason category: codemod / async API / React 19 types / library peer / test API / caching.
7. The report contains the caching inventory (a)–(c), with the decision for each entry.

## 9. Report format
JSON per `docs/codex-report-schema.json`. In `self_verification.findings`, include:
- the before/after audit counts;
- the library upgrades with reasons;
- the file categories;
- any place where caching or behaviour could differ and how you kept it the same.

Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.

## 10. Constraints
No DB writes, deploy, commit or push. Never touch `.claude/launch.json` or `apps/mobile`. No new dependencies beyond required version bumps.
