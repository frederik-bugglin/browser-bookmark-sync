// Public API of the sync engine.
//
// Production wiring (in main.ts):
//   const drivers = createRealDrivers();
//   const cloud = createSupabaseCloudClient(supabase);
//   const logStore = createLogStore(app.getPath('userData'));
//   const engine = new SyncEngine({ cloud, drivers, logStore });
//   await engine.runSync({ userId, triggeredBy: 'manual' });

import { createSupabaseCloudClient, type CloudClient } from './cloud';
import { createRealDrivers, type BrowserDriver, type DriverDeps } from './drivers';
import { createLogStore, type LogStore } from './log';
import { runPipeline } from './pipeline';
import type { BrowserId, SyncRunResult } from './types';

export type SyncEngineDeps = {
  cloud: CloudClient;
  drivers: BrowserDriver[];
  logStore: LogStore;
};

export type RunSyncOptions = {
  userId: string;
  triggeredBy: 'manual' | 'auto' | 'restore';
  /** When set, only browsers in this list participate in the run. */
  enabledBrowserIds?: BrowserId[];
};

export class SyncEngine {
  private running = false;
  private lastResult: SyncRunResult | null = null;

  constructor(private readonly deps: SyncEngineDeps) {}

  isRunning(): boolean {
    return this.running;
  }

  getLastResult(): SyncRunResult | null {
    return this.lastResult;
  }

  async runSync(options: RunSyncOptions): Promise<SyncRunResult> {
    if (this.running) {
      throw new Error('sync already running');
    }
    this.running = true;
    try {
      const result = await runPipeline({
        userId: options.userId,
        triggeredBy: options.triggeredBy,
        cloud: this.deps.cloud,
        drivers: this.deps.drivers,
        logStore: this.deps.logStore,
        enabledBrowserIds: options.enabledBrowserIds,
      });
      this.lastResult = result;
      return result;
    } finally {
      this.running = false;
    }
  }
}

// Re-exports for consumers (main.ts wires these up).
export { createSupabaseCloudClient } from './cloud';
export { createRealDrivers } from './drivers';
export { createLogStore } from './log';
export type { CloudClient } from './cloud';
export type { BrowserDriver, DriverDeps } from './drivers';
export type { LogStore } from './log';
export type {
  BrowserId,
  BrowserPlan,
  RootKey,
  NormalizedBookmark,
  NormalizedFolder,
  NormalizedSnapshot,
  SyncRunLog,
  SyncRunOutcome,
  SyncRunResult,
} from './types';
export { SyncEngineError } from './types';
export { ALLOWED_BROWSER_IDS, isValidBrowserId, assertBrowserId } from './browser-id';
export { computeBookmarkHash, hashOf } from './identity';
