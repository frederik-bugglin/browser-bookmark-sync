import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SyncRunLog } from './types';

const MAX_RUNS = 100;

// Per-run telemetry on disk. Lives in the Electron userData folder, FIFO
// rotation. The log is for debugging and post-incident review -- it is
// never read by the UI or by another machine. Multi-Mac users get their
// own log per machine.

export type LogStore = {
  baseDir: string;
};

export function createLogStore(userDataDir: string): LogStore {
  const baseDir = path.join(userDataDir, 'logs', 'sync-runs');
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  return { baseDir };
}

export function writeRunLog(store: LogStore, log: SyncRunLog): void {
  rotateOldRuns(store);
  const file = path.join(store.baseDir, `${log.runId}.json`);
  writeFileSync(file, JSON.stringify(log, null, 2), 'utf8');
}

function rotateOldRuns(store: LogStore): void {
  const files = readdirSync(store.baseDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  while (files.length >= MAX_RUNS) {
    const oldest = files.shift();
    if (oldest) {
      try {
        unlinkSync(path.join(store.baseDir, oldest));
      } catch {
        // ignore
      }
    }
  }
}
