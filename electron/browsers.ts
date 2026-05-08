import { EventEmitter } from 'node:events';
import * as chromium from './adapters/chromium';
import * as firefox from './adapters/firefox';
import * as safari from './adapters/safari';
import type { JsonStore } from './store';
import type { BrowserId, Settings } from './state';

export type BrowserStatus = {
  id: BrowserId;
  name: string;
  installed: boolean;
  detected: boolean;
  permissionsOk: boolean;
  enabled: boolean;
  acknowledged: boolean;
};

// Single source of truth for "which browsers does Junction know about".
// Detection results are cached per refresh() call; renderers get a snapshot
// via list() and live updates through 'change' events. Settings changes
// re-emit because enabled/acknowledged are settings-derived.
export class BrowsersService extends EventEmitter {
  private cache: BrowserStatus[] = [];

  constructor(private readonly settingsStore: JsonStore<Settings>) {
    super();
    this.cache = this.detect();
    settingsStore.on('change', () => {
      this.cache = this.detect();
      this.emit('change', this.cache);
    });
  }

  list(): BrowserStatus[] {
    return this.cache;
  }

  refresh(): BrowserStatus[] {
    this.cache = this.detect();
    this.emit('change', this.cache);
    return this.cache;
  }

  /** Pre-fill enabled+acknowledged for currently detected browsers (used by v1→v2 migration). */
  detectIds(): BrowserId[] {
    return this.detect()
      .filter((b) => b.installed && b.detected)
      .map((b) => b.id);
  }

  private detect(): BrowserStatus[] {
    const settings = this.settingsStore.get();
    const enabled = new Set(settings.enabledBrowsers);
    const acknowledged = new Set(settings.acknowledgedBrowsers);
    const out: BrowserStatus[] = [];

    for (const d of chromium.detectAll()) {
      out.push({
        id: d.id,
        name: d.name,
        installed: d.installed,
        detected: d.hasDefaultProfile,
        permissionsOk: true,
        enabled: enabled.has(d.id),
        acknowledged: acknowledged.has(d.id),
      });
    }

    for (const d of firefox.detectAll()) {
      out.push({
        id: d.id,
        name: d.name,
        installed: d.installed,
        detected: d.hasDefaultProfile,
        permissionsOk: true,
        enabled: enabled.has(d.id),
        acknowledged: acknowledged.has(d.id),
      });
    }

    const s = safari.detectSafari();
    out.push({
      id: 'safari',
      name: 'Safari',
      installed: s.installed,
      detected: s.hasDefaultProfile,
      permissionsOk: s.permission === 'granted',
      enabled: enabled.has('safari'),
      acknowledged: acknowledged.has('safari'),
    });

    return out;
  }
}

// Run once at boot when stored schemaVersion is 1: pre-fill enabledBrowsers
// and acknowledgedBrowsers with all currently-detected browsers, then bump
// schemaVersion to 2. New v2 installs skip this entirely (defaults are []).
export function migrateSettingsV1ToV2(
  settingsStore: JsonStore<Settings>,
  browsers: BrowsersService,
): boolean {
  const current = settingsStore.get();
  if (current.schemaVersion !== 1) return false;
  const ids = browsers.detectIds();
  settingsStore.set({
    schemaVersion: 2,
    enabledBrowsers: ids,
    acknowledgedBrowsers: ids,
  });
  return true;
}
