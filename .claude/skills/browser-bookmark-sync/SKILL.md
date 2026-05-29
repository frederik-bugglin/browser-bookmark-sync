---
name: browser-bookmark-sync
description: Repository-specific conventions and workflows for the browser-bookmark-sync Electron app. Auto-generated from git history, then curated.
---

# browser-bookmark-sync Development Patterns

> Auto-generated skill from repository analysis, then curated.

## Overview

`browser-bookmark-sync` is an Electron + Next.js app that synchronizes bookmarks across desktop browsers (Chrome, Safari, Firefox, Arc, Brave, Edge, Zen, Dia) on macOS. Backend: Supabase. Tests: vitest.

This skill captures the project's coding conventions, commit patterns, and the main workflows for feature development, bugfixing, documentation updates, adapter implementation, and sync-engine work.

The repo's primary slash-command workflow (`/requirements` → `/architecture` → `/frontend`/`/backend` → `/qa` → `/deploy`) is defined in `CLAUDE.md`. The patterns below describe the underlying code-level conventions any of those workflows produce.

---

## Coding Conventions

**File Naming**
- `camelCase` for file and directory names.
- Examples: `bookmarkAdapter.ts`, `syncEngine/index.ts`.

**Import Style**
- Relative imports for in-repo modules.
- Example:
  ```typescript
  import { resolveConflicts } from './conflictResolver'
  import { Adapter } from '../adapters/chromium/adapter'
  ```

**Export Style**
- Named exports.
- Example:
  ```typescript
  // electron/adapters/chromium/adapter.ts
  export function detectChromium() { ... }
  export function readBookmarks() { ... }
  ```

**Commit Patterns**
- [Conventional Commits](https://www.conventionalcommits.org/) with scope.
- Prefixes seen in history: `fix`, `docs`, `feat`, `chore`, `build`.
- Project convention from CLAUDE.md: include the feature ID, e.g. `feat(PROJ-X): description`.
- Examples:
  ```
  feat(sync): add multi-phase pipeline for conflict resolution
  fix(adapter): handle empty bookmark folders in Firefox
  docs(qa): update QA walkthrough for Safari adapter
  ```

---

## Workflows

### Feature Development with Spec and QA Cycle

Used when adding a major feature or component (adapter, sync engine, conflict log, settings UI, sync trigger).

1. Write or update the spec in `features/PROJ-X-name.md`.
2. Implement across the relevant modules:
   - `electron/adapters/*/`
   - `electron/sync-engine/*`
   - `electron/conflicts/*`
   - `src/components/*`
   - `src/app/*`
3. Update `features/INDEX.md` to reflect status (`Planned`, `Architected`, `In Progress`, `In Review`, `Approved`, `Deployed`).
4. After QA, mark the feature as `Approved` in both the spec and `features/INDEX.md`.

---

### Bugfix or QA-Driven Patch with Regression Test

Used when fixing a bug found during QA or live use.

1. Identify and fix the bug.
2. Add or update a regression/unit test in the corresponding `*.test.ts` (co-located).
3. Update the feature spec or QA report if applicable.
4. Commit referencing the issue/QA context.

Example:
```typescript
// electron/adapters/chromium/bookmarkReader.ts
export function readBookmarks() { ... }

// electron/adapters/chromium/bookmarkReader.test.ts
import { readBookmarks } from './bookmarkReader'
test('handles empty folders', () => { ... })
```

---

### Docs and Status Update Cycle

Used when updating documentation or marking features as complete.

1. Update docs under `docs/` or specs under `features/`.
2. Update `TODO.md` (technical) or the project's wiki page (strategic) with new findings or closed items.
3. Mark features as `Deployed`/`Approved` in `features/INDEX.md`.
4. Commit with `docs(...)` or `chore(...)` prefix.

---

### Adapter Implementation or Enhancement

Used when adding or improving support for a browser's bookmark format.

1. Create or update modules under `electron/adapters/<browser>/` (types, detect, read, write, mapping, lock, etc.).
2. Add or update tests in `electron/adapters/<browser>/*.test.ts`.
3. Update the spec in `features/PROJ-*-adapter-<browser>.md`.
4. Update `features/INDEX.md`.

---

### Sync Engine or Pipeline Enhancement

Used when adding or refining sync pipeline logic, conflict handling, or cloud data flow.

1. Update or add modules under `electron/sync-engine/` (pipeline, diff, resolve, drivers, route, etc.).
2. Add or update tests in `electron/sync-engine/*.test.ts`.
3. Add or update Supabase migration scripts in `supabase/migrations/*.sql` when the schema changes.
4. Update the spec in `features/PROJ-6-sync-engine.md`.
5. Update `features/INDEX.md`.

---

## Testing Patterns

- **Framework:** [vitest](https://vitest.dev/)
- **Pattern:** `*.test.ts` co-located next to the implementation file.
- **E2E:** Playwright tests live in `tests/`.
- **Rule:** every bugfix gets a regression test.

Example:
```typescript
// electron/sync-engine/diff.test.ts
import { diffBookmarks } from './diff'

test('detects added bookmarks', () => {
  const result = diffBookmarks(oldList, newList)
  expect(result.added).toContainEqual({ ... })
})
```
