# Sprint 148 — Find the ~3-second section load floor (diagnosis only)

**Severity: L1** (read-only investigation; NO code changes this sprint).

## 1. Objective
Find exactly why every owner dashboard section shows "Loading …" for ~3.0–3.5 s on production, and propose the smallest safe fix. Do not implement it — report only.

## 2. Context
- Branch `main`, HEAD `cca5487`.
- Measured on production 2026-10-03 (smoke owner, tiny data set: 1 property, 1 unit, 1 lease, 4 charges): switching to Maintenance, Portfolio, Expenses, Leases → ~3,050 ms each; Charges ~3,560 ms; a later check showed "Loading charges…" still at 5 s. The near-identical times on very different sections suggest a fixed floor (sequential awaits / waterfall, an artificial delay or timeout, a serial server action, revalidation, or a cold path), not data volume.
- Sections render inside the owner workspace (`components/dashboard/index.tsx`, `section-renderer.tsx`, `dashboard-data-loader.tsx`, `dashboard-kpi-loader.ts`, `app/owner/owner-page-data.ts` with its "bundle" plan). Section switches happen client-side via the command palette / sidebar / prev-next arrows and show a "Loading <section>..." placeholder.
- Codex has a read-only `supabase` MCP (can inspect query plans/indexes via SQL like `explain`), network access, and can run `npm run build` locally. Codex cannot run a browser; it may add TEMPORARY timing logs locally to measure, but must revert them before finishing.

## 3. In scope
1. Trace the code path from a section click to the content rendering: what triggers the load (server action, route change, fetch, `router.refresh`, dynamic import, `useTransition`), what data is fetched, and in what order.
2. Identify every `await` on that path that is sequential but could be parallel, any `setTimeout`/minimum-delay/debounce, any per-section re-fetch of the whole owner bundle, any N+1 queries, and any slow DB query (use `explain analyze` via the read-only MCP where helpful; tiny data means DB time should be small).
3. Quantify: estimate (or measure locally with temporary instrumentation) how much of the ~3 s each cause contributes.
4. Propose the smallest fix (files + approach), ranked by impact and risk, and say whether it touches auth/money/schema (it should not).

## 4. Out of scope
- ANY committed code change. Temporary local instrumentation must be removed; `git status` must show no changes from you at the end (except nothing).
- DB writes, migrations, deploy, env changes, commit, push.

## 5. Exact files expected to change
None. The working tree must be unchanged at the end.

## 6. Implementation requirements
- Cite file:line for every claim. Separate measured facts from hypotheses.
- Do not invent URLs or emails.

## 7. Validation commands
```bash
git status --short   # must show only the pre-existing .claude/launch.json change
```

## 8. Acceptance criteria (binary)
- Root cause(s) identified with file:line evidence and a time attribution.
- A ranked fix proposal with exact files and expected savings.
- Working tree unchanged.

## 9. Report format
Conform to `docs/codex-report-schema.json`: set `gate_passed` true only if you ran nothing that could fail (or ran a build for measurement and it passed); put the trace, attributions, and ranked proposals in `self_verification.findings`; `files_changed` must be empty.
No "Claude prompt" sections and no recommended next steps for Claude.

## 10. Constraints
Read-only. No DB writes, deploy, env/secret changes, commit, or push.
