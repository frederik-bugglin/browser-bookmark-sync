import type { JsonStore } from '../store';
import type { AppState, Settings } from '../state';
import type { SyncService, SyncState } from '../sync';
import type { AuthService } from '../auth';
import type { Notifier, OnlineProbe, PowerEvents } from './types';

export type { Notifier, OnlineProbe, PowerEvents } from './types';
export { createDnsProbe } from './online';
export { createElectronNotifier } from './notifications';

export type SyncTriggerDeps = {
  syncService: SyncService;
  appStateStore: JsonStore<AppState>;
  settingsStore: JsonStore<Settings>;
  authService: AuthService;
  isOnline: OnlineProbe;
  notify: Notifier;
  powerEvents: PowerEvents;
};

// Coordinates WHEN syncs run. Runs syncs HOW lives in SyncEngine/SyncService.
//
// - Auto-tick: every N minutes via setTimeout-recursion, with online + auth
//   pre-check
// - Online-Monitor: separate 60 s poll that surfaces offline status quickly
//   (without it the user would only see 'Offline' at the next sync tick,
//   up to 60 minutes for the longest interval)
// - Manual trigger: `triggerNow()` from tray; resets the auto-schedule so we
//   don't double-fire 1 min after a manual run
// - Sleep/Wake: clear timers on suspend, fresh schedule on resume (no
//   immediate fire after wake, otherwise macOS timer-coalescing storms us)
// - Notifications: on sync error AND user-toggled `notifyOnSyncError`
export class SyncTrigger {
  private static readonly ONLINE_CHECK_MS = 60_000;

  private intervalId: NodeJS.Timeout | null = null;
  private onlineCheckId: NodeJS.Timeout | null = null;
  private monitorActive = false;
  // Armed when we expect the next online observation to be worth retrying:
  // either after the DNS probe came back offline, or after a sync errored
  // out (most often a transient network blip). The next successful online
  // poll fires a recovery sync and clears this flag.
  private pendingRecovery = false;
  private started = false;
  private detachers: Array<() => void> = [];

  constructor(private readonly deps: SyncTriggerDeps) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    const onSettingsChange = (s: Settings) => this.applySettings(s);
    this.deps.settingsStore.on('change', onSettingsChange);
    this.detachers.push(() => this.deps.settingsStore.off('change', onSettingsChange));

    const onSyncChange = (s: SyncState) => this.handleSyncStateChange(s);
    this.deps.syncService.on('change', onSyncChange);
    this.detachers.push(() => this.deps.syncService.off('change', onSyncChange));

    const onSuspend = () => this.handleSuspend();
    this.deps.powerEvents.on('suspend', onSuspend);
    this.detachers.push(() => this.deps.powerEvents.off('suspend', onSuspend));

    const onResume = () => this.handleResume();
    this.deps.powerEvents.on('resume', onResume);
    this.detachers.push(() => this.deps.powerEvents.off('resume', onResume));

    this.applySettings(this.deps.settingsStore.get());
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.clearTimer();
    this.stopOnlineMonitor();
    this.detachers.forEach((fn) => fn());
    this.detachers = [];
    this.deps.appStateStore.set({ nextScheduledSyncAt: null });
  }

  // Manual trigger — used by the tray "Jetzt synchronisieren" button.
  // Errors propagate to the caller (the renderer-bound IPC path also routes
  // through `syncService.run` directly, so this is mainly for the tray).
  async triggerNow(): Promise<void> {
    if (this.deps.syncService.getState().isRunning) return;
    try {
      await this.deps.syncService.run('manual');
    } catch {
      // State is already mirrored to AppState by the sync→state bridge in main.ts.
    }
    // Reset the auto-schedule so the next auto-tick is intervalMs from now,
    // not from the previous tick.
    this.applySettings(this.deps.settingsStore.get());
  }

  private applySettings(settings: Settings): void {
    this.clearTimer();
    if (!settings.autoSyncEnabled) {
      this.stopOnlineMonitor();
      this.deps.appStateStore.set({ nextScheduledSyncAt: null });
      return;
    }
    this.scheduleNext(settings.autoSyncIntervalMin * 60_000);
    this.startOnlineMonitor();
  }

  private scheduleNext(intervalMs: number): void {
    const tickAt = Date.now() + intervalMs;
    this.deps.appStateStore.set({
      nextScheduledSyncAt: new Date(tickAt).toISOString(),
    });
    // setTimeout-recursion (vs setInterval) keeps the schedule clean across
    // settings changes, suspend/resume, and manual triggers — every reschedule
    // is a fresh timer rooted at "now".
    this.intervalId = setTimeout(() => {
      void this.tick(intervalMs);
    }, intervalMs);
  }

  private async tick(intervalMs: number): Promise<void> {
    this.intervalId = null;

    if (!this.deps.syncService.getState().isRunning) {
      const online = await this.deps.isOnline();
      if (!online) {
        this.deps.appStateStore.set({ lastSyncStatus: 'skipped-offline' });
      } else if (this.deps.authService.getStatus().state === 'authenticated') {
        try {
          await this.deps.syncService.run('auto');
        } catch {
          // Mirrored to AppState elsewhere.
        }
      }
      // Unauthenticated → silent skip, no state change.
    }

    if (this.started && this.deps.settingsStore.get().autoSyncEnabled) {
      this.scheduleNext(intervalMs);
    }
  }

  private clearTimer(): void {
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  private handleSuspend(): void {
    this.clearTimer();
    this.stopOnlineMonitor();
    this.deps.appStateStore.set({ nextScheduledSyncAt: null });
  }

  private handleResume(): void {
    if (!this.started) return;
    const settings = this.deps.settingsStore.get();
    if (settings.autoSyncEnabled) {
      this.scheduleNext(settings.autoSyncIntervalMin * 60_000);
      this.startOnlineMonitor();
    }
  }

  // Background poll so the user sees 'Offline' within ~60 s of pulling the
  // network — without it, status only flips at the next sync-tick (up to
  // 60 minutes for the longest auto-interval).
  private startOnlineMonitor(): void {
    if (this.monitorActive) return;
    this.monitorActive = true;
    void this.checkOnline();
    this.onlineCheckId = setInterval(() => {
      void this.checkOnline();
    }, SyncTrigger.ONLINE_CHECK_MS);
  }

  private stopOnlineMonitor(): void {
    this.monitorActive = false;
    if (this.onlineCheckId !== null) {
      clearInterval(this.onlineCheckId);
      this.onlineCheckId = null;
    }
  }

  private async checkOnline(): Promise<void> {
    const online = await this.deps.isOnline();
    // Bail if the monitor was stopped while we were awaiting the DNS probe.
    if (!this.monitorActive) return;

    if (!online) {
      this.pendingRecovery = true;
      const status = this.deps.appStateStore.get().lastSyncStatus;
      if (status === 'running' || status === 'skipped-offline') return;
      this.deps.appStateStore.set({ lastSyncStatus: 'skipped-offline' });
      return;
    }

    // Online recovery: fire a sync as soon as we observe connectivity after
    // a previous offline OR a previous sync error. Without it the user
    // would wait up to a full intervalMs for the auto-schedule to retry.
    if (this.pendingRecovery) {
      this.pendingRecovery = false;
      void this.runRecoverySync();
    }
  }

  private async runRecoverySync(): Promise<void> {
    if (this.deps.syncService.getState().isRunning) return;
    if (this.deps.authService.getStatus().state !== 'authenticated') return;
    try {
      await this.deps.syncService.run('auto');
    } catch {
      // Mirrored to AppState elsewhere.
    }
    // Reset the auto-schedule so the next regular tick is intervalMs from
    // now (not from the stale schedule that was set before going offline).
    if (this.started) {
      this.applySettings(this.deps.settingsStore.get());
    }
  }

  private handleSyncStateChange(state: SyncState): void {
    if (state.isRunning) return;
    if (!state.lastResult) return;
    const failed =
      state.lastResult.outcome === 'error' || state.lastResult.outcome === 'partial';
    if (!failed) return;

    // Arm online-recovery: most sync failures are transient network blips.
    // Next online-monitor tick (≤60 s) will retry without waiting for the
    // full auto-interval. If the cloud is genuinely down, the retry loop
    // is bounded by the 60 s poll cadence — Phase-2 backoff is out-of-scope.
    this.pendingRecovery = true;

    if (!this.deps.settingsStore.get().notifyOnSyncError) return;
    const errors = state.lastResult.log.errors;
    const body = errors.length > 0 ? errors[0] : 'Sync ist fehlgeschlagen.';
    this.deps.notify('Junction', body);
  }
}
