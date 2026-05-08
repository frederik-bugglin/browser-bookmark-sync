import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { SyncTrigger } from './index';
import type { Notifier, OnlineProbe, PowerEvents } from './types';

// Tests inject every Electron-API dependency (powerMonitor, Notification,
// net) so they run in the regular Node test environment. Each test uses
// fake timers so we can fast-forward setInterval ticks deterministically.

type Settings = {
  schemaVersion: 1;
  autoLaunch: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMin: 5 | 15 | 30 | 60;
  notifyOnSyncError: boolean;
};

type AppState = {
  schemaVersion: 1;
  firstLaunchDone: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  nextScheduledSyncAt: string | null;
  mainWindowBounds: null;
};

class FakeStore<T extends object> extends EventEmitter {
  constructor(private data: T) {
    super();
  }
  get(): T {
    return this.data;
  }
  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch };
    this.emit('change', this.data);
    return this.data;
  }
}

class FakePowerEvents extends EventEmitter implements PowerEvents {
  fireSuspend(): void {
    this.emit('suspend');
  }
  fireResume(): void {
    this.emit('resume');
  }
}

class FakeSyncService extends EventEmitter {
  state: { isRunning: boolean; lastResult: unknown } = { isRunning: false, lastResult: null };
  runMock = vi.fn(async (_triggeredBy: string) => {
    this.state = { isRunning: true, lastResult: this.state.lastResult };
    this.emit('change', this.state);
    await Promise.resolve();
    const result = {
      runId: 'r1',
      outcome: 'success' as const,
      log: { errors: [] as string[] },
    };
    this.state = { isRunning: false, lastResult: result };
    this.emit('change', this.state);
    return result;
  });
  getState() {
    return this.state;
  }
  run(triggeredBy: string) {
    return this.runMock(triggeredBy);
  }
}

class FakeAuthService {
  status: { state: 'authenticated' | 'unauthenticated' | 'loading' } = { state: 'authenticated' };
  getStatus() {
    return this.status;
  }
}

const FALLBACK_SETTINGS: Settings = {
  schemaVersion: 1,
  autoLaunch: true,
  autoSyncEnabled: true,
  autoSyncIntervalMin: 5,
  notifyOnSyncError: false,
};

const FALLBACK_APP_STATE: AppState = {
  schemaVersion: 1,
  firstLaunchDone: true,
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  nextScheduledSyncAt: null,
  mainWindowBounds: null,
};

function makeTrigger(overrides: {
  settings?: Partial<Settings>;
  appState?: Partial<AppState>;
  authState?: 'authenticated' | 'unauthenticated' | 'loading';
  isOnline?: OnlineProbe;
  notify?: Notifier;
} = {}) {
  const settingsStore = new FakeStore<Settings>({ ...FALLBACK_SETTINGS, ...overrides.settings });
  const appStateStore = new FakeStore<AppState>({ ...FALLBACK_APP_STATE, ...overrides.appState });
  const auth = new FakeAuthService();
  if (overrides.authState) auth.status = { state: overrides.authState };
  const sync = new FakeSyncService();
  const power = new FakePowerEvents();
  const isOnline = overrides.isOnline ?? (async () => true);
  const notify = overrides.notify ?? vi.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trigger = new SyncTrigger({
    syncService: sync as any,
    appStateStore: appStateStore as any,
    settingsStore: settingsStore as any,
    authService: auth as any,
    isOnline,
    notify: notify as Notifier,
    powerEvents: power,
  });

  return { trigger, settingsStore, appStateStore, sync, power, notify };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncTrigger', () => {
  it('schedules first tick after intervalMs, does not fire immediately on start', () => {
    const { trigger, sync, appStateStore } = makeTrigger();
    trigger.start();

    expect(sync.runMock).not.toHaveBeenCalled();
    expect(appStateStore.get().nextScheduledSyncAt).not.toBeNull();

    // Just before the tick — still not fired.
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(sync.runMock).not.toHaveBeenCalled();

    trigger.stop();
  });

  it('runs sync at tick when online + authenticated', async () => {
    const { trigger, sync } = makeTrigger();
    trigger.start();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sync.runMock).toHaveBeenCalledWith('auto');

    trigger.stop();
  });

  it('skips silently and marks skipped-offline when offline', async () => {
    const isOnline = vi.fn(async () => false);
    const { trigger, sync, appStateStore } = makeTrigger({ isOnline });
    trigger.start();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sync.runMock).not.toHaveBeenCalled();
    expect(appStateStore.get().lastSyncStatus).toBe('skipped-offline');

    trigger.stop();
  });

  it('online-monitor sets skipped-offline within 60 s when network drops', async () => {
    let online = true;
    const isOnline = vi.fn(async () => online);
    const { trigger, appStateStore } = makeTrigger({
      isOnline,
      appState: { lastSyncStatus: 'success', lastSyncAt: new Date().toISOString() },
    });
    trigger.start();

    // Initial check fires immediately on start — still online.
    await vi.advanceTimersByTimeAsync(0);
    expect(appStateStore.get().lastSyncStatus).toBe('success');

    // Network drops between polls.
    online = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(appStateStore.get().lastSyncStatus).toBe('skipped-offline');

    trigger.stop();
  });

  it('online-monitor triggers a recovery sync when going from offline back to online', async () => {
    let online = false;
    const isOnline = vi.fn(async () => online);
    const { trigger, sync, appStateStore } = makeTrigger({ isOnline });
    trigger.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(appStateStore.get().lastSyncStatus).toBe('skipped-offline');
    expect(sync.runMock).not.toHaveBeenCalled();

    // Network comes back — recovery sync fires within the next poll cycle.
    online = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync.runMock).toHaveBeenCalledWith('auto');

    trigger.stop();
  });

  it('recovery sync does NOT fire when the trigger started while online', async () => {
    const isOnline = vi.fn(async () => true);
    const { trigger, sync } = makeTrigger({ isOnline });
    trigger.start();

    // Two poll cycles — never went offline, so no recovery should fire.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sync.runMock).not.toHaveBeenCalled();

    trigger.stop();
  });

  it('arms recovery on sync error so the next online-poll retries', async () => {
    const isOnline = vi.fn(async () => true);
    const { trigger, sync } = makeTrigger({ isOnline });
    trigger.start();

    // Initial online-check: pendingRecovery=false, no recovery fires.
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.runMock).not.toHaveBeenCalled();

    // A sync errors out (typically network).
    sync.emit('change', {
      isRunning: false,
      lastResult: {
        runId: 'r1',
        outcome: 'error',
        log: { errors: ['Cloud unreachable'] },
      },
    });

    // Next poll observes online and fires recovery.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync.runMock).toHaveBeenCalledWith('auto');

    trigger.stop();
  });

  it('does NOT arm recovery on sync success', async () => {
    const isOnline = vi.fn(async () => true);
    const { trigger, sync } = makeTrigger({ isOnline });
    trigger.start();
    await vi.advanceTimersByTimeAsync(0);

    sync.emit('change', {
      isRunning: false,
      lastResult: { runId: 'r1', outcome: 'success', log: { errors: [] } },
    });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(sync.runMock).not.toHaveBeenCalled();

    trigger.stop();
  });

  it('online-monitor does NOT touch a running sync', async () => {
    const isOnline = vi.fn(async () => false);
    const { trigger, sync, appStateStore } = makeTrigger({
      isOnline,
      appState: { lastSyncStatus: 'running' },
    });
    sync.state = { isRunning: true, lastResult: null };
    trigger.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(appStateStore.get().lastSyncStatus).toBe('running');

    trigger.stop();
  });

  it('online-monitor stops when autoSyncEnabled is toggled off', async () => {
    const isOnline = vi.fn(async () => false);
    const { trigger, settingsStore, appStateStore } = makeTrigger({ isOnline });
    trigger.start();

    settingsStore.set({ autoSyncEnabled: false });
    appStateStore.set({ lastSyncStatus: 'success' });

    await vi.advanceTimersByTimeAsync(120_000);
    // No more polls happening, status preserved.
    expect(appStateStore.get().lastSyncStatus).toBe('success');

    trigger.stop();
  });

  it('skips silently when not authenticated (no state change)', async () => {
    const { trigger, sync, appStateStore } = makeTrigger({ authState: 'unauthenticated' });
    trigger.start();
    const beforeStatus = appStateStore.get().lastSyncStatus;

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sync.runMock).not.toHaveBeenCalled();
    expect(appStateStore.get().lastSyncStatus).toBe(beforeStatus);

    trigger.stop();
  });

  it('clears the schedule when autoSyncEnabled is toggled off', () => {
    const { trigger, settingsStore, appStateStore } = makeTrigger();
    trigger.start();
    expect(appStateStore.get().nextScheduledSyncAt).not.toBeNull();

    settingsStore.set({ autoSyncEnabled: false });
    expect(appStateStore.get().nextScheduledSyncAt).toBeNull();

    trigger.stop();
  });

  it('reschedules when intervalMin changes mid-run', () => {
    const { trigger, settingsStore, appStateStore } = makeTrigger({ settings: { autoSyncIntervalMin: 5 } });
    trigger.start();
    const firstTickAt = new Date(appStateStore.get().nextScheduledSyncAt!).getTime();

    vi.advanceTimersByTime(60_000);
    settingsStore.set({ autoSyncIntervalMin: 30 });
    const secondTickAt = new Date(appStateStore.get().nextScheduledSyncAt!).getTime();

    // New schedule is 30 min from now, so >= 25 min after the original.
    expect(secondTickAt - firstTickAt).toBeGreaterThanOrEqual(25 * 60_000);

    trigger.stop();
  });

  it('clears interval on suspend, reschedules on resume — but does NOT fire immediately', async () => {
    const { trigger, sync, power, appStateStore } = makeTrigger();
    trigger.start();
    expect(appStateStore.get().nextScheduledSyncAt).not.toBeNull();

    power.fireSuspend();
    expect(appStateStore.get().nextScheduledSyncAt).toBeNull();

    power.fireResume();
    expect(appStateStore.get().nextScheduledSyncAt).not.toBeNull();
    expect(sync.runMock).not.toHaveBeenCalled();

    // The fresh interval should still take a full intervalMs to fire.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sync.runMock).toHaveBeenCalledTimes(1);

    trigger.stop();
  });

  it('skips tick if a sync is already running', async () => {
    const { trigger, sync } = makeTrigger();
    sync.state = { isRunning: true, lastResult: null };
    trigger.start();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sync.runMock).not.toHaveBeenCalled();

    trigger.stop();
  });

  it('triggerNow calls run("manual") and resets the schedule', async () => {
    const { trigger, sync, appStateStore } = makeTrigger();
    trigger.start();
    const before = new Date(appStateStore.get().nextScheduledSyncAt!).getTime();

    vi.advanceTimersByTime(60_000);
    await trigger.triggerNow();
    expect(sync.runMock).toHaveBeenCalledWith('manual');

    const after = new Date(appStateStore.get().nextScheduledSyncAt!).getTime();
    expect(after - before).toBeGreaterThanOrEqual(60_000);

    trigger.stop();
  });

  it('triggerNow is a no-op when a sync is already running', async () => {
    const { trigger, sync } = makeTrigger();
    sync.state = { isRunning: true, lastResult: null };
    trigger.start();

    await trigger.triggerNow();
    expect(sync.runMock).not.toHaveBeenCalled();

    trigger.stop();
  });

  it('notifies on sync error when notifyOnSyncError is true', () => {
    const notify = vi.fn();
    const { trigger, sync } = makeTrigger({
      settings: { notifyOnSyncError: true },
      notify,
    });
    trigger.start();

    sync.emit('change', {
      isRunning: false,
      lastResult: {
        runId: 'r1',
        outcome: 'error',
        log: { errors: ['Cloud nicht erreichbar'] },
      },
    });

    expect(notify).toHaveBeenCalledWith('Junction', 'Cloud nicht erreichbar');

    trigger.stop();
  });

  it('does NOT notify on sync error when notifyOnSyncError is false', () => {
    const notify = vi.fn();
    const { trigger, sync } = makeTrigger({
      settings: { notifyOnSyncError: false },
      notify,
    });
    trigger.start();

    sync.emit('change', {
      isRunning: false,
      lastResult: {
        runId: 'r1',
        outcome: 'error',
        log: { errors: ['boom'] },
      },
    });

    expect(notify).not.toHaveBeenCalled();

    trigger.stop();
  });

  it('does NOT notify on success', () => {
    const notify = vi.fn();
    const { trigger, sync } = makeTrigger({
      settings: { notifyOnSyncError: true },
      notify,
    });
    trigger.start();

    sync.emit('change', {
      isRunning: false,
      lastResult: { runId: 'r1', outcome: 'success', log: { errors: [] } },
    });

    expect(notify).not.toHaveBeenCalled();

    trigger.stop();
  });

  it('stop() clears schedule and removes listeners', () => {
    const { trigger, settingsStore, appStateStore, sync } = makeTrigger();
    trigger.start();
    trigger.stop();

    expect(appStateStore.get().nextScheduledSyncAt).toBeNull();

    // Settings change after stop must not re-arm the schedule.
    settingsStore.set({ autoSyncIntervalMin: 30 });
    expect(appStateStore.get().nextScheduledSyncAt).toBeNull();
    expect(sync.runMock).not.toHaveBeenCalled();
  });
});
