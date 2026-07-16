# Sprint 105 — Feedback Message Copy Button

## Objective

Add a per-message "Copy" button to the feedback viewer so feedback text can be copied with one click. Verify that text selection is not blocked by any CSS.

## Context

- Branch: `main`
- HEAD: `bb52bca` (Sprint 104)
- The feedback viewer is at `apps/web/components/ops/feedback-viewer.tsx`
- Feedback message text is in a `<p>` with `text-sm leading-6 text-foreground` — no `select-none` is present, so text is already selectable
- No clipboard functionality exists in the component
- The feedback message is truncated to 140 chars when collapsed, full text when expanded

## In Scope

1. Add a small "Copy" button next to each feedback message
2. Button copies the full `entry.message` text (not truncated) to clipboard
3. Show brief inline confirmation after copy ("Copied" text or checkmark, auto-resets after 2 seconds)
4. Confirm no CSS prevents normal text selection on the message

## Out of Scope

- Redesigning the feedback page layout
- Changing feedback data structures or server actions
- Adding backend logic
- Toast system or global notification for copy
- Copy functionality for other fields (email, URL, etc.)

## Exact Files Expected to Change

| File | Change |
|------|--------|
| `apps/web/components/ops/feedback-viewer.tsx` | Add copy button per feedback entry with clipboard API + inline confirmation |

## Implementation Requirements

### 1. Copy Button

Add a small button near the feedback message text (line 229-231 area). Position it inline with the message header or as an icon button in the top-right corner of the entry card.

```typescript
const [copiedId, setCopiedId] = useState<string | null>(null);

async function copyMessage(id: string, message: string) {
  await navigator.clipboard.writeText(message);
  setCopiedId(id);
  setTimeout(() => setCopiedId(null), 2000);
}
```

Button rendering per entry:
```tsx
<button
  type="button"
  onClick={() => copyMessage(entry.id, entry.message)}
  className="..."
  title="Copy feedback message"
>
  {copiedId === entry.id ? (
    <Check className="h-3.5 w-3.5 text-emerald-600" />
  ) : (
    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
  )}
</button>
```

Import `Copy` and `Check` icons from `lucide-react`.

### 2. Confirm Text Selection

Verify that no parent element has `select-none` or `pointer-events-none` that would block text selection on the message `<p>` element. If any parent does, add `select-text` to the message element to override.

### 3. Styling

- Button should be subtle — small icon, muted color, no border unless hovered
- On hover: slightly more visible
- After copy: show green checkmark for 2 seconds, then revert to copy icon
- Do not disrupt existing card layout or spacing

## Validation Commands to Run

```bash
cd /Users/courtneysmith/Documents/Codex/Rental\ Properties
npm run gate:web
```

## Acceptance Criteria

1. [ ] Each feedback entry has a copy button visible
2. [ ] Clicking copy button copies the full `entry.message` to clipboard (not truncated)
3. [ ] After copy: button shows checkmark/confirmation for ~2 seconds, then reverts
4. [ ] Feedback message text is selectable with normal mouse highlight
5. [ ] Existing feedback layout and functionality unchanged
6. [ ] `gate:web` passes

## Report Format

```
gate:web: PASS | FAIL
files_changed: [list]
acceptance_criteria: [1-6] PASS | FAIL each
notes: (any deviations or questions)
```

## Constraints

- Frontend-only changes — no backend modifications
- Do NOT change feedback data structures or server actions
- Do NOT redesign the feedback page
- Do NOT add a global toast system
- Single file change only (`feedback-viewer.tsx`)
- Do NOT include "Claude prompt" or recommended next steps sections. Report compact status only.
