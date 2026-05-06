import { EventEmitter } from 'node:events';
import type { SyncEngine, RunSyncOptions } from './sync-engine';
import type { SyncRunResult } from './sync-engine';
import type { AuthService } from './auth';

export type SyncState = {
  isRunning: boolean;
  lastResult: SyncRunResult | null;
};

// Thin wrapper around SyncEngine. Adds:
//   - integration with AuthService (looks up the userId from the live session)
//   - state events the renderer can subscribe to
//   - guard against running without a session

export class SyncService extends EventEmitter {
  private state: SyncState = { isRunning: false, lastResult: null };

  constructor(
    private readonly engine: SyncEngine,
    private readonly auth: AuthService,
  ) {
    super();
  }

  getState(): SyncState {
    return this.state;
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
    try {
      const result = await this.engine.runSync({
        userId: status.userId,
        triggeredBy,
      });
      this.setState({ isRunning: false, lastResult: result });
      return result;
    } catch (err) {
      this.setState({ isRunning: false, lastResult: this.state.lastResult });
      throw err;
    }
  }

  private setState(next: SyncState): void {
    this.state = next;
    this.emit('change', next);
  }
}
