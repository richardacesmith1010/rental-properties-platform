# Sprint 52 — Codex Implementation Prompt

## 1. Objective

Improve the onboarding flow for new owners: auto-advance checklist steps when completed, add subtle animations, clearer CTAs, and a skip option for experienced landlords.

## 2. Context

- **Branch**: `main`
- **HEAD**: (use latest after Sprint 51)
- **Gate baseline**: all unit tests passing, lint clean, typecheck clean, build clean
- **Current onboarding**: `app/owner/setup/page.tsx` and/or the welcome card in section-renderer.tsx showing a checklist (Profile completed, Account set up, Add a property, Add a unit, Create a lease, Connect bank account)

## 3. In Scope

### Part A: Onboarding Checklist Improvements
1. **Auto-advance**: When a step completes (e.g., user adds a property), automatically highlight the next incomplete step
2. **Progress indicator**: Add a progress percentage or "3 of 6 complete" counter at the top
3. **Step descriptions**: Add a one-line helper text under each step explaining what it does
4. **Completed step styling**: Completed steps should have a strikethrough or muted style, not just a checkmark
5. **Active step highlight**: The next uncompleted step should pulse or have a subtle highlight border

### Part B: Skip Option
1. Add a "Skip setup — go to dashboard" link below the checklist
2. When clicked, dismiss the onboarding card and show the normal overview dashboard
3. Store skip preference so it doesn't reappear (use localStorage or a profile flag)

### Part C: Animated Transitions
1. When a step transitions from incomplete → complete, add a brief check animation (CSS only, no external libs)
2. Progress bar should animate when percentage increases
3. Use `transition-all duration-300` for smooth state changes

### Part D: Welcome Card Polish
1. Improve the welcome card layout — center the mascot, add a subtitle explaining Domus's value
2. Make the "Add Your First Property" CTA more prominent (larger, with an icon)
3. Add a secondary CTA: "Watch a 2-minute tour" (link to a future video placeholder, just an anchor for now)

## 4. Out of Scope

- Creating the actual tour video
- Changing the onboarding form fields
- Manager or tenant onboarding
- Database migrations
- CLAUDE.md / AGENTS.md edits

## 5. Exact Files Expected to Change

1. `apps/web/components/dashboard/section-renderer.tsx` — welcome card rendering, skip logic
2. `apps/web/app/owner/setup/page.tsx` — if setup page exists separately
3. `apps/web/components/dashboard/dashboard-data-loader.tsx` — pass onboarding state
4. New: `apps/web/components/dashboard/onboarding-checklist.tsx` — extracted checklist component with animations

## 6. Implementation Requirements

### Progress Counter
```tsx
const completedSteps = steps.filter(s => s.completed).length;
const totalSteps = steps.length;
const progressPct = Math.round((completedSteps / totalSteps) * 100);

<div className="flex items-center gap-3 mb-4">
  <div className="text-sm text-muted-foreground">
    {completedSteps} of {totalSteps} complete
  </div>
  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
    <div
      className="h-full bg-primary rounded-full transition-all duration-500"
      style={{ width: `${progressPct}%` }}
    />
  </div>
  <span className="text-sm font-medium">{progressPct}%</span>
</div>
```

### Step Item Component
```tsx
interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  active: boolean; // next incomplete step
}

// Render each step:
<div className={cn(
  "flex items-start gap-3 rounded-lg p-3 transition-all duration-300",
  step.completed && "opacity-60",
  step.active && "bg-primary/5 ring-1 ring-primary/20"
)}>
  {step.completed ? (
    <CheckCircle className="h-5 w-5 text-emerald-500 animate-in fade-in" />
  ) : (
    <Circle className="h-5 w-5 text-muted-foreground" />
  )}
  <div>
    <p className={cn("font-medium", step.completed && "line-through text-muted-foreground")}>
      {step.label}
    </p>
    <p className="text-sm text-muted-foreground">{step.description}</p>
  </div>
</div>
```

### Step Descriptions
```typescript
const ONBOARDING_STEPS = [
  { id: "profile", label: "Profile completed", description: "Your name and contact info are set." },
  { id: "account", label: "Account set up", description: "Your ownership account is ready." },
  { id: "property", label: "Add a property", description: "Enter your property address and details." },
  { id: "unit", label: "Add a unit", description: "Create at least one unit within your property." },
  { id: "lease", label: "Create a lease", description: "Set up rent terms for a tenant." },
  { id: "bank", label: "Connect bank account", description: "Link your bank for rent collection." },
];
```

### Skip Logic
```tsx
const [dismissed, setDismissed] = useState(() => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("domus-onboarding-dismissed") === "true";
  }
  return false;
});

const handleSkip = () => {
  localStorage.setItem("domus-onboarding-dismissed", "true");
  setDismissed(true);
};

// Don't render onboarding card if dismissed
if (dismissed) return <NormalOverview />;
```

### Welcome Card Layout
```tsx
<div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
  {/* Mascot */}
  <div className="mx-auto mb-4">
    <DomMascot size={120} />
  </div>

  <h2 className="text-2xl font-bold text-foreground">Welcome, {nickname}!</h2>
  <p className="mt-2 text-muted-foreground">
    Let's get your first property set up. Here's your progress:
  </p>

  {/* Progress + Checklist */}
  <OnboardingChecklist steps={steps} />

  {/* CTAs */}
  <div className="mt-6 flex flex-col gap-3">
    <Button size="lg" className="w-full">
      <Plus className="mr-2 h-4 w-4" />
      Add Your First Property
    </Button>
    <button
      onClick={handleSkip}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Skip setup — go to dashboard →
    </button>
  </div>
</div>
```

## 7. Validation Commands to Run

```bash
npm run gate:web
```

## 8. Acceptance Criteria

1. [ ] Progress counter shows "X of 6 complete" with animated progress bar
2. [ ] Completed steps have strikethrough + muted styling
3. [ ] Next incomplete step has subtle highlight border
4. [ ] Step descriptions visible under each step label
5. [ ] "Skip setup" link dismisses onboarding and shows normal overview
6. [ ] Skip preference persists across page reloads (localStorage)
7. [ ] Welcome card centers mascot with clear typography hierarchy
8. [ ] "Add Your First Property" CTA is prominent with icon
9. [ ] All new UI uses semantic tokens (text-foreground, bg-card, etc.) — dark mode compatible
10. [ ] `npm run gate:web` passes
11. [ ] No regressions for users who already have properties (they shouldn't see onboarding)

## 9. Report Format

```
STATUS: PASS | FAIL
FILES_CHANGED: [list]
NEW_FILES: [list]
TESTS_UNIT: xxx/xxx
LINT: clean | [errors]
TYPECHECK: clean | [errors]
BUILD: clean | [errors]
NOTES: [any issues]
```

## 10. Constraints

- Do NOT create database migrations
- Do NOT deploy to Vercel
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT modify E2E test files
- Do NOT install new npm dependencies (CSS animations only)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections
- Use semantic color tokens throughout (Sprint 50 compliance)
