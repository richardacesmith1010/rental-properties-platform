# Sprint 254b — Screen-reader structure: one h1 per page, no empty or skipped headings, no duplicate ids (L2) — rev 1

## 1. Objective
Claude audited what a screen reader hears on production (iPhone WebKit, smoke accounts, 2026-10-22): owner Home,
Rent, Repairs, Messages, Money, Bank, Settings; manager Home, Rent, Repairs, Messages; tenant Home, Rent, Repairs,
Messages; login, signup, landing, terms. Every control and image already has a name. Three structure problems remain:
1. **Manager pages have no `h1`.** The section title renders as `<h2>` (`components/dashboard/index.tsx:50`), so
   VoiceOver's heading rotor has no page title. (Owner and tenant pages have exactly one `h1`.)
2. **Duplicate ids on every section page.** `components/dashboard/index.tsx:472` wraps the section in
   `<section id={activeSection}>`, and the section's own card repeats the id: `<Card id="charges">`
   (`charges/charges-implementation.tsx:259`), `id="maintenance"` (`maintenance-section.tsx:153`), `id="inbox"`
   (`inbox-section.tsx:139`, `inbox-views.tsx:171`), and `<Card id=…>` in `payments-section.tsx`, `units-section.tsx`,
   `notifications-section.tsx`, `automation-templates-section.tsx`, `activity-feed.tsx`, `vendors-section.tsx`,
   `portfolio-section.tsx`, `tenants-section.tsx`, `leases-section.tsx`.
3. **Skipped and empty headings.** Owner Repairs reads `H1 Repairs → H3 Repairs → H3 (empty)`. `CardTitle`
   (`components/ui/card.tsx:58-59`) is always `<h3>`, so a section card title under the page `h1` skips `h2`, and it
   repeats the page title. One `h3` on that page has no text.

## 2. Context
HEAD: see `git log -1`. Nothing reads these inner card ids: `getElementById`/`scrollIntoView` only target
`charge-<id>` rows and command-palette buttons; sidebar anchors `#${item.id}` (`sidebar/sidebar-nav.tsx`) point at the
`<section id>` wrapper, which keeps its id.

## 3. In scope
1. Manager (and any non-owner-daily-ops) page header at `index.tsx:50`: render the title as `<h1>` with the same
   classes, so every dashboard page for every role has **exactly one** visible `h1`.
2. Remove the `id` prop from the inner section `<Card>`s listed in §1.2 (keep the `<section id>` wrapper).
3. `CardTitle` gets an optional `as?: "h2" | "h3"` prop (default `"h3"`, same classes). The section cards in §1.2 that
   render a section-level `CardTitle` use `as="h2"`. Where the card title only repeats the page `h1` text, keep it
   visible but render it as `h2` (no copy change).
4. Find the empty `h3` on owner Repairs and fix it: if it can be empty, render no heading element when there is no
   text (or use a `<p>` for a non-heading label). No visual change.

## 4. Out of scope
Copy, layout, colours, tab bars, settings pages, public pages, the tenant section tabs (already correct).

## 5. Exact files expected to change
`apps/web/components/dashboard/index.tsx`, `apps/web/components/ui/card.tsx`, the section files named in §1.2, the file
holding the empty heading, and `apps/web/components/__tests__/heading-structure-254b.test.tsx` (new). List each with
line deltas in the report.

## 6. Implementation requirements
Lines ≤ 140 characters. Plain-language guard passes. L-022: no child-selector hiding. Existing snapshot tests may only
change by the `h3 → h2` / removed `id` attributes (list each updated snapshot and why).

## 7. Validation
```
cd apps/web
npx vitest run components/__tests__/heading-structure-254b.test.tsx
```
then from the repo root `npm run gate:web`. Claude re-runs the production screen-reader audit after deploy.

## 8. Acceptance criteria
- H1 Rendering the dashboard shell for role manager on a section (e.g. charges) yields exactly one `h1` whose text is
  the section title; for role owner on a section, still exactly one `h1`.
- H2 `CardTitle` renders `<h3>` by default and `<h2>` with `as="h2"`, same class names in both.
- H3 Each §1.2 section component (render at least charges, maintenance, inbox, units, leases, tenants) has no element
  with `id` equal to its section key, and its section title is an `h2`.
- H4 Owner maintenance section rendered with the smoke-like data shape (one open ticket, one closed) has no empty
  heading (`h1`–`h6` with empty trimmed text) and no heading-level skip greater than one (h1→h3) inside the section.
- H5 Gate green (counts verbatim).

## 9. Report format
Compact status only: each change → file:line, H1–H5 → test names, counts. Do NOT include 'Claude prompt' or
'recommended next steps for Claude' sections. Report compact status only.

## 10. Constraints
Stay inside §5. Do not commit. The user should never need to read instructions to complete this flow: a screen reader
user hears one page title, then sections in order.
