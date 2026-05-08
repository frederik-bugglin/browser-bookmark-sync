import { EventEmitter } from 'node:events';
import type { SyncEngine, RunSyncOptions } from './sync-engine';
import type { SyncRunResult } from './sync-engine';
import type { AuthService } from './auth';
import type { JsonStore } from './store';
import type { Settings } from './state';

export type SyncState = {
  isRunning: boolean;
  lastResult: SyncRunResult | null;
};

// Thin wrapper around SyncEngine. Adds:
//   - integration with AuthService (looks up the userId from the live session)
//   - state events the renderer can subscribe to
//   - guard against running without a session
//   - awaitIdle() so logout can wait out an active run before signing out
//   - reads enabledBrowsers from settings on every run

export class SyncService extends EventEmitter {
  private state: SyncState = { isRunning: false, lastResult: null };
  private inflight: Promise<SyncRunResult> | null = null;

  constructor(
    private readonly engine: SyncEngine,
    private readonly auth: AuthService,
    private readonly settingsStore: JsonStore<Settings>,
  ) {
    super();
  }

  getState(): SyncState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }

  /** Wait for the current run (if any) to finish. Resolves when the engine is idle. */
  async awaitIdle(): Promise<void> {
    if (this.inflight) {
      try {
        await this.inflight;
      } catch {
        // The caller of run() already saw the error; awaitIdle just needs to resolve.
      }
    }
  }

  async run(triggeredBy: RunSyncOptions['triggeredBy']): Promise<SyncRunResult> {
    const status = this.auth.getStatus();
    if (status.state !== 'authenticated') {
      throw new Error('Sync requires sign-in.');
    }

    if (this.engine.isRunning()) {
      throw new Error('Sync is already running.');
    }

    this.setState({ isRunning: true, lastResult: this.state.lastResult });
    const promise = (async () => {
      try {
        const result = await this.engine.runSync({
          userId: status.userId,
          triggeredBy,
          enabledBrowserIds: this.settingsStore.get().enabledBrowsers,
        });
        this.setState({ isRunning: false, lastResult: result });
        return result;
      } catch (err) {
        this.setState({ isRunning: false, lastResult: this.state.lastResult });
        throw err;
      } finally {
        this.inflight = null;
      }
    })();
    this.inflight = promise;
    return promise;
  }

  private setState(next: SyncState): void {
    this.state = next;
    this.emit('change', next);
  }
}
