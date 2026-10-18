# Sprint 239a — Early-access Terms and Privacy pages (L2, copy only)

## 1. Objective
Replace the March 4, 2026 text on `/terms` and `/privacy` with the owner-approved early-access text in
`docs/legal/early-access-terms-privacy-2026-10-18.md`, character for character, with its date line and banner.

## 2. Context
- HEAD: latest `main`. Pages: `apps/web/app/terms/page.tsx` (81 lines) and `apps/web/app/privacy/page.tsx` (81 lines), both
  `LandingShell` + `<main>` + header (title, "Last updated: March 4, 2026", warning banner :16-18) + one section of
  `<article>` blocks (`h2` + `p`/`ul`).
- The March text is wrong today (e.g. it describes billing; Domus is free in early access).
- Owner decisions 2026-10-18 (`docs/agent-handoff.md`): name Richard Smith (individual), 30-day notice before charging,
  30-day privacy response, 7-year financial records. The lawyer's edits will replace this version later.
- `lib/plain-language/scan.ts:64` exempts `app/terms` and `app/privacy` from the 12-word rule.

## 3. In scope
The two page files and one new test file.

## 4. Out of scope
Any other page or component, `LandingShell`, metadata titles, links in footers, the support page, any app behavior.

## 5. Exact files expected to change
1. `apps/web/app/terms/page.tsx`
2. `apps/web/app/privacy/page.tsx`
3. `apps/web/app/__tests__/legal-pages.test.tsx` (new)

## 6. Implementation requirements
- Keep the existing layout, classes and `metadata` exports. Replace only the date line, banner text and section content.
- Date line: `Last updated: October 18, 2026`. Banner (same styled `<p>` as today): `Early access version. A lawyer is
  reviewing these terms. We will tell you before a final version takes effect.` (the same banner on both pages).
- Each **bold lead** in the source (e.g. **Who we are.**) becomes an `<article>` with an `h2` of that lead without the
  period ("Who we are"), followed by the rest of the paragraph as `<p>`. Bullet lists become `<ul className="list-disc
  space-y-1 pl-5">` with `<li>` items; a bold label inside a bullet becomes `<strong className="text-white">`.
- Text is copied exactly from the source file (§1), including curly/straight quotes as written and the "→" arrows.
  Email addresses stay plain text exactly as written (no new links). No other copy.
- Each file stays ≤ 200 lines; added lines ≤ 140 characters.

## 7. Validation commands
```
(cd apps/web && npx vitest run app/__tests__/legal-pages.test.tsx lib/__tests__/plain-language.test.ts)
(cd apps/web && npx vitest run --reporter=dot)
(cd apps/web && npx tsc --noEmit)
npm run lint:web
```
Do NOT run `npm run gate:web`.

## 8. Acceptance criteria
1. `legal-pages.test.tsx` renders each page (mock `LandingShell` to render children) and asserts with `toBeInTheDocument`:
   the date line; the exact banner; every `h2` heading in source order (`getAllByRole("heading", { level: 2 })` mapped to
   text equals the expected array for each page); and these exact sentences: Terms — "Domus (\"we\") is run by Richard
   Smith, an individual." (match by the text after the heading as rendered), "We will tell you at least 30 days before we
   start charging."; Privacy — "We answer within 30 days.", "Financial records (rent, payments, expenses) are kept for 7
   years after the tax year they belong to.", "Owners: Settings → Account & Data → Delete my account.".
2. Neither page's text contains `March 4`, `[`, `LAWYER`, `DECISION`, or `billed` (assert on `document.body.textContent`).
3. Full suite, tsc, lint and the plain-language test are green.

## 9. Report format
Compact status only: files changed with line counts, test names, command results.
Do NOT include 'Claude prompt' or 'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
- Only the files in §5. No new dependencies. Exact copy only; invent no strings, URLs or emails.
- The user should never need to read instructions to complete this flow. Every step must be self-explanatory. If the
  user needs to think about what to do, the UI needs to be clearer.
