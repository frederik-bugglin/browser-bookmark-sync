```markdown
# browser-bookmark-sync Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you how to contribute to the `browser-bookmark-sync` project, a TypeScript/Next.js codebase for synchronizing browser bookmarks across platforms. You'll learn the project's coding conventions, commit patterns, and the main workflows for feature development, bugfixing, documentation, adapter implementation, and sync engine enhancements. This guide also covers testing strategies and provides handy `/commands` for common tasks.

---

## Coding Conventions

**File Naming**
- Use `camelCase` for file and directory names.
  - Example: `bookmarkAdapter.ts`, `syncEngine/index.ts`

**Import Style**
- Use relative imports for modules.
  - Example:
    ```typescript
    import { resolveConflicts } from './conflictResolver'
    import { Adapter } from '../adapters/chromium/adapter'
    ```

**Export Style**
- Use named exports.
  - Example:
    ```typescript
    // electron/adapters/chromium/adapter.ts
    export function detectChromium() { ... }
    export function readBookmarks() { ... }
    ```

**Commit Patterns**
- Use [Conventional Commits](https://www.conventionalcommits.org/).
- Prefixes: `fix`, `docs`, `feat`, `chore`, `build`
- Example:
  ```
  feat(sync): add multi-phase pipeline for conflict resolution
  fix(adapter): handle empty bookmark folders in Firefox
  docs(qa): update QA walkthrough for Safari adapter
  ```

---

## Workflows

### Feature Development with Spec and QA Cycle

**Trigger:** When adding a major feature or component (e.g., adapter, sync engine, conflict log, settings UI, sync trigger).  
**Command:** `/new-feature`

1. Write or update the tech design/spec file in `features/PROJ-*/`.
2. Implement the feature (code, tests, IPC, UI, etc.) across relevant modules:
    - `electron/adapters/*/`
    - `electron/sync-engine/*`
    - `electron/conflicts/*`
    - `src/components/*`
    - `src/app/*`
3. Update `features/INDEX.md` to reflect status (`Planned`, `Architected`, `In Progress`, `Approved`).
4. After QA, add or update a QA report and mark the feature as `Approved` in `features/PROJ-*/` and `features/INDEX.md`.

**Example:**
```markdown
## PROJ-12-sync-trigger
Status: In Progress

- [x] Spec written
- [ ] Implementation
- [ ] QA
```

---

### Bugfix or QA-Driven Patch with Regression Test

**Trigger:** When fixing a bug found during QA or live use and ensuring it doesn't recur.  
**Command:** `/bugfix`

1. Identify and fix the bug in the relevant code module.
2. Add or update a regression/unit test in the corresponding `.test.ts` file.
3. If applicable, update the relevant feature spec or QA report.
4. Commit referencing the issue/QA context.

**Example:**
```typescript
// electron/adapters/chromium/bookmarkReader.ts
export function readBookmarks() { ... }

// electron/adapters/chromium/bookmarkReader.test.ts
import { readBookmarks } from './bookmarkReader'
test('handles empty folders', () => { ... })
```

---

### Docs and Status Update Cycle

**Trigger:** When updating documentation, reflecting new caveats, or marking features as complete.  
**Command:** `/docs-update`

1. Update or add documentation in `docs/` or `features/` directories.
2. Update `TODO.md` or QA walkthroughs with new findings or closed items.
3. Mark features as `Deployed`/`Approved` in `features/INDEX.md` or `features/PROJ-*/`.
4. Commit with `docs(...)` or `chore(...)` prefix.

**Example:**
```markdown
## features/INDEX.md
- [x] PROJ-10-adapter-firefox (Deployed)
```

---

### Adapter Implementation or Enhancement

**Trigger:** When adding or improving support for a browser's bookmark format.  
**Command:** `/adapter-update`

1. Create or update modules under `electron/adapters/<browser>/` (types, detect, read, write, mapping, lock, etc.).
2. Add or update tests in `electron/adapters/<browser>/*.test.ts`.
3. Update feature spec in `features/PROJ-*-adapter-<browser>.md`.
4. Update `features/INDEX.md` to reflect progress/status.

**Example:**
```typescript
// electron/adapters/firefox/bookmarkWriter.ts
export function writeFirefoxBookmarks() { ... }
```

---

### Sync Engine or Pipeline Enhancement

**Trigger:** When adding or refining sync pipeline logic, conflict handling, or cloud data flow.  
**Command:** `/sync-engine-update`

1. Update or add modules under `electron/sync-engine/` (pipeline, diff, resolve, drivers, route, etc.).
2. Add or update tests in `electron/sync-engine/*.test.ts`.
3. If needed, add or update Supabase migration scripts in `supabase/migrations/*.sql`.
4. Update feature spec in `features/PROJ-6-sync-engine.md`.
5. Update `features/INDEX.md` to reflect progress/status.

**Example:**
```typescript
// electron/sync-engine/conflictResolver.ts
export function resolveConflicts(local, remote) { ... }
```

---

## Testing Patterns

- **Framework:** [vitest](https://vitest.dev/)
- **Test File Pattern:** `*.test.ts` (placed alongside implementation files)
- **Test Example:**
  ```typescript
  // electron/sync-engine/diff.test.ts
  import { diffBookmarks } from './diff'

  test('detects added bookmarks', () => {
    const result = diffBookmarks(oldList, newList)
    expect(result.added).toContainEqual({ ... })
  })
  ```
- **Regression tests** are added/updated for every bugfix.

---

## Commands

| Command              | Purpose                                                      |
|----------------------|--------------------------------------------------------------|
| /new-feature         | Start a new feature development cycle                        |
| /bugfix              | Begin a bugfix with regression test                          |
| /docs-update         | Update documentation or feature status                       |
| /adapter-update      | Implement or enhance a browser adapter                       |
| /sync-engine-update  | Enhance sync engine or pipeline logic                        |
```
