# Codebase Grooming

Codex owns this file (moved verbatim from AGENTS.md §13 on 2026-10-14).

Every sprint must leave the codebase cleaner than it was found. The codebase is optimized for AI agent readability and efficiency — not human readability.

### Why This Matters

Every file an AI agent reads costs tokens. Dead files, misleading names, god files, and stale docs waste tokens on every review cycle. Keeping the codebase tight directly makes Claude's reviews faster and Codex's execution cheaper.

### Standing Rules

1. **Delete dead code.** If nothing imports a file, delete it. Git preserves history. Never leave orphaned components, unused exports, or empty placeholder modules.

2. **One purpose per file.** If a file does two unrelated things, split it. If a file has a misleading name (e.g., `owner.ts` that contains only a string formatter), rename or consolidate it.

3. **No god files.** No single component file should exceed 30KB. If it does, split it into focused sub-components. The dashboard orchestrator (`index.tsx`) and tester tools are known offenders — chip away at them when touching nearby code.

4. **Consolidate utilities.** Don't create a new `utils-2.ts` or `helpers.ts` when `utils.ts` or `format.ts` already exists. One utility file per concern.

5. **Archive stale docs.** Docs describing completed phases (V1 scope, V1 UAT, old roadmaps) go in `docs/archive/`. Only current-state docs live in `docs/`.

6. **Shared code earns its place.** `packages/shared/` must contain real exports used by 2+ workspaces. If it's empty or unused, flag it for deletion.

7. **Consistent naming.** Follow these patterns exactly:
   - Dashboard sections: `{name}-section.tsx`
   - Lib modules: `{domain}.ts`
   - Tests: `{domain}.test.ts` in `__tests__/`
   - Components: `{name}.tsx` in appropriate folder

### Per-Sprint Grooming Checklist

Before reporting your sprint as complete, check:
- [ ] No new orphaned files created
- [ ] No new files >30KB without justification
- [ ] Any touched file that was misnamed or redundant → cleaned up
- [ ] If you created a utility function, it went in an existing utility file (not a new one)
- [ ] Imports in modified files still resolve (no broken references after renames)

### Commit Protocol

Every sprint must end with a commit and push to `origin/main`. Do NOT leave work in the working tree for Claude to discover uncommitted. Use the commit message format specified in the sprint prompt. If no format is specified, use:

```
feat|fix|chore: <short description>

- bullet point per major change
```

### Size Budget

When building a new component or module, if it will exceed 20KB, split it into sub-components before committing. Do not create a god file and plan to split it later — split upfront. If an existing file is already over 30KB and you're modifying it, split out at least one logical sub-component as part of your sprint.

### Import Verification

After any file rename, move, or delete, you MUST run `npm run gate:web` and confirm zero broken imports before reporting done. A passing gate is the only acceptable proof that renames didn't break anything. If the gate fails after a rename, fix the imports — don't revert the rename.

- Sprint 259a: split LLC join registration from `app/actions/llc-invitations.ts` (510-line exception) in 259b.
