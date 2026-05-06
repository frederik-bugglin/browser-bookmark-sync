import type { BrowserId } from './types';

// Whitelist matching the conflict_log.browser_id and bookmark_snapshots.browser_id
// CHECK constraints in 0002_sync_engine.sql. Any value the engine ever passes
// to an adapter or to Supabase must clear this gate first.
//
// This collapses the path-traversal defense-in-depth findings ISSUE-001
// from the QA reports of PROJ-3 / PROJ-4 / PROJ-5: the adapters' backup
// directory paths use browserId as a path segment. An untrusted value
// could walk out of the backup tree. The engine is the choke point.
const ALLOWED: ReadonlySet<BrowserId> = new Set<BrowserId>([
  'safari',
  'firefox',
  'zen',
  'chrome',
  'arc',
  'brave',
  'edge',
  'dia',
]);

export function isValidBrowserId(value: string): value is BrowserId {
  return ALLOWED.has(value as BrowserId);
}

export function assertBrowserId(value: string): BrowserId {
  if (!isValidBrowserId(value)) {
    throw new Error(`invalid browser id: ${JSON.stringify(value)}`);
  }
  return value;
}

export const ALLOWED_BROWSER_IDS = Array.from(ALLOWED) as readonly BrowserId[];
