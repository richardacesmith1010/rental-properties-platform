# Sprint 29 — Dashboard Navigation & KPI Hero

## Objective

Fix three navigation UX issues on the owner Daily Ops dashboard: add scroll-to-top on section changes, hide the workflow mode banner on detail sections, and enable arrow navigation from Daily Ops into Records mode. Zero new features — navigation polish only.

## Context

- Branch: `main`
- HEAD: `0a9068f` (Sprint 28 — visual consistency polish)
- Gate baseline: 503/503 tests, lint clean, typecheck clean, build clean
- Production: `https://domusbase.com`

## In Scope

1. Scroll to top on section change
2. Hide workflow mode banner on non-overview sections
3. Boundary navigation: Daily Ops ↔ Records via arrows
4. Update button disabled states for boundary bridging

## Out of Scope

- No new features or pages
- No test file modifications
- No new npm dependencies
- No DB/migration changes
- No deploy
- No changes to CLAUDE.md or AGENTS.md
- No changes to section arrays in `dashboard-config.ts`

## Exact Files Expected to Change

1. `apps/web/components/dashboard/index.tsx`

That's it — one file. All changes are in the dashboard orchestrator.

## Implementation Requirements

### Part A: Scroll to Top on Section Change

Add a `useEffect` that scrolls to top whenever `activeSection` changes. Place it near the existing `activeSection` effects (around lines 335-339):

```tsx
useEffect(() => {
  window.scrollTo({ top: 0, behavior: "smooth" });
}, [activeSection]);
```

This ensures every section navigation (arrows, sidebar click, mode switch) starts the user at the top of the viewport.

### Part B: Hide Workflow Mode Banner on Detail Sections

The workflow mode banner is rendered at lines 668-677:

```tsx
{(isOwnerRole || isManagerRole) && activeWorkflowMeta && (
  <div className="domus-glass flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-sm font-semibold text-zinc-900">
      {activeWorkflowMeta.label}
    </p>
    <p className="text-sm text-zinc-500">
      {activeWorkflowMeta.description}
    </p>
  </div>
)}
```

Add `activeSection === "overview"` to the condition so it only shows on the KPI hero landing:

```tsx
{(isOwnerRole || isManagerRole) && activeWorkflowMeta && activeSection === "overview" && (
```

This reclaims ~50px of vertical space on all operational sections (Charges, Payments, etc.), making content sit higher on the screen.

### Part C: Boundary Navigation — Daily Ops ↔ Records

Modify `goToNextSection` (currently lines 347-350) to bridge from Daily Ops into Records:

```tsx
const goToNextSection = () => {
  if (activeSectionIndex < 0) return;
  if (activeSectionIndex >= sectionItems.length - 1) {
    // At the last section — bridge to Records if in owner Daily Ops
    if (isOwnerRole && ownerWorkflowMode === "daily_ops") {
      setOwnerWorkflowMode("records");
      // Skip Records "overview" (same KPIs) — land on "documents"
      setActiveSection("documents");
    }
    return;
  }
  setActiveSection(sectionItems[activeSectionIndex + 1].id);
};
```

Modify `goToPreviousSection` (currently lines 343-346) to bridge back from Records into Daily Ops:

```tsx
const goToPreviousSection = () => {
  if (activeSectionIndex <= 0) {
    // At the first section — bridge back to Daily Ops if in owner Records mode
    if (isOwnerRole && ownerWorkflowMode === "records") {
      setOwnerWorkflowMode("daily_ops");
      // Land on "analytics" — the last Daily Ops section
      setActiveSection("analytics");
    }
    return;
  }
  setActiveSection(sectionItems[activeSectionIndex - 1].id);
};
```

### Part D: Update Button Disabled States

The current disabled logic (lines 686 and 696) needs to account for boundary bridging:

**Previous button** (line 686):
```tsx
// Before:
disabled={activeSectionIndex <= 0}

// After:
disabled={activeSectionIndex <= 0 && !(isOwnerRole && ownerWorkflowMode === "records")}
```

**Next button** (line 696):
```tsx
// Before:
disabled={activeSectionIndex < 0 || activeSectionIndex >= sectionItems.length - 1}

// After:
disabled={
  activeSectionIndex < 0 ||
  (activeSectionIndex >= sectionItems.length - 1 &&
    !(isOwnerRole && ownerWorkflowMode === "daily_ops"))
}
```

This ensures:
- The Next button stays enabled on Analytics (last Daily Ops section) → user can bridge to Records
- The Previous button stays enabled on the first Records section → user can bridge back to Daily Ops
- All other workflow modes (New Property, New Tenant, New Manager, Vendor Ops) keep their current disabled behavior

### Design Notes

- When bridging Daily Ops → Records, skip the Records "overview" section because it shows the same KPI hero the user already saw. Land on "documents" instead.
- When bridging Records → Daily Ops, land on "analytics" (the last Daily Ops section), which is where the user was before bridging.
- The workflow mode banner auto-updates when the mode changes, but since it's now hidden on non-overview sections, the user won't see a jarring mode label change mid-navigation.
- Only owner role gets boundary bridging. Manager role doesn't have a Records mode.

## Validation Commands to Run

```bash
npm run gate:web
```

This runs: 503+ tests (36 suites), ESLint, TypeScript strict check, Next.js production build.

## Acceptance Criteria

1. [ ] Arrowing right from KPI overview → Charges, viewport scrolls to top
2. [ ] Arrowing between any sections scrolls to top smoothly
3. [ ] Workflow mode banner hidden on all sections except overview (KPI hero)
4. [ ] Arrowing right from Analytics → switches to Records mode, lands on Documents
5. [ ] Arrowing left from first Records section → switches to Daily Ops, lands on Analytics
6. [ ] Next button enabled on Analytics in Daily Ops (bridge to Records)
7. [ ] Previous button enabled on first Records section (bridge to Daily Ops)
8. [ ] No broken navigation in other workflow modes (New Property, New Tenant, New Manager)
9. [ ] `npm run gate:web` passes (503+ tests, lint, typecheck, build)

## Report Format

```
gate_passed: true/false
test_count: <number>
lint_clean: true/false
typecheck_clean: true/false
build_clean: true/false
files_changed: <list>
```

## Constraints

- Do NOT modify test files
- Do NOT add new npm dependencies
- Do NOT modify DB or deploy
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Do NOT change section arrays in `dashboard-config.ts`
- Report compact status only
