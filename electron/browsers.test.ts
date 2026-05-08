// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDirHolder = { value: '' };

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpDirHolder.value,
  },
}));

// Mock the adapter detection so we can deterministically simulate which
// browsers are "installed" without depending on the host machine.
const detectionState = {
  chromium: [
    { id: 'chrome', name: 'Google Chrome', installed: true, hasDefaultProfile: true },
    { id: 'brave', name: 'Brave', installed: false, hasDefaultProfile: false },
    { id: 'edge', name: 'Microsoft Edge', installed: false, hasDefaultProfile: false },
    { id: 'arc', name: 'Arc', installed: false, hasDefaultProfile: false },
    { id: 'dia', name: 'Dia', installed: false, hasDefaultProfile: false },
  ],
  firefox: [
    { id: 'firefox', name: 'Firefox', installed: true, hasDefaultProfile: true },
    { id: 'zen', name: 'Zen', installed: false, hasDefaultProfile: false },
  ],
  safari: {
    installed: true,
    hasDefaultProfile: true,
    permission: 'granted' as 'granted' | 'denied' | 'unavailable',
  },
};

vi.mock('./adapters/chromium', () => ({
  detectAll: () => detectionState.chromium,
}));
vi.mock('./adapters/firefox', () => ({
  detectAll: () => detectionState.firefox,
}));
vi.mock('./adapters/safari', () => ({
  detectSafari: () => ({
    id: 'safari',
    name: 'Safari',
    installed: detectionState.safari.installed,
    hasDefaultProfile: detectionState.safari.hasDefaultProfile,
    permission: detectionState.safari.permission,
  }),
}));

import { JsonStore } from './store';
import { SettingsSchema, defaultSettings, type Settings } from './state';
import { BrowsersService, migrateSettingsV1ToV2 } from './browsers';

describe('BrowsersService', () => {
  beforeEach(() => {
    tmpDirHolder.value = mkdtempSync(path.join(os.tmpdir(), 'junction-browsers-'));
  });
  afterEach(() => {
    rmSync(tmpDirHolder.value, { recursive: true, force: true });
  });

  it('list() reflects detected browsers and current settings', () => {
    const store = new JsonStore<Settings>('settings.json', SettingsSchema, {
      ...defaultSettings,
      enabledBrowsers: ['chrome'],
      acknowledgedBrowsers: ['chrome'],
    });
    const service = new BrowsersService(store);
    const list = service.list();

    const chrome = list.find((b) => b.id === 'chrome');
    expect(chrome).toMatchObject({
      installed: true,
      detected: true,
      enabled: true,
      acknowledged: true,
    });

    const firefox = list.find((b) => b.id === 'firefox');
    expect(firefox).toMatchObject({
      installed: true,
      detected: true,
      enabled: false,
      acknowledged: false,
    });
  });

  it('emits change event when settings change', () => {
    const store = new JsonStore<Settings>('settings.json', SettingsSchema, defaultSettings);
    const service = new BrowsersService(store);
    const events: string[][] = [];
    service.on('change', (list) => {
      events.push(list.filter((b: { enabled: boolean }) => b.enabled).map((b: { id: string }) => b.id));
    });
    store.set({ enabledBrowsers: ['firefox'] });
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toContain('firefox');
  });

  it('Safari permission state surfaces as permissionsOk=false', () => {
    detectionState.safari.permission = 'denied';
    const store = new JsonStore<Settings>('settings.json', SettingsSchema, defaultSettings);
    const service = new BrowsersService(store);
    const safari = service.list().find((b) => b.id === 'safari');
    expect(safari?.permissionsOk).toBe(false);
    detectionState.safari.permission = 'granted';
  });
});

describe('migrateSettingsV1ToV2', () => {
  beforeEach(() => {
    tmpDirHolder.value = mkdtempSync(path.join(os.tmpdir(), 'junction-migrate-'));
  });
  afterEach(() => {
    rmSync(tmpDirHolder.value, { recursive: true, force: true });
  });

  it('pre-fills enabled+acknowledged from currently detected browsers when v1 is loaded', () => {
    // Simulate a v1 file on disk by writing it before constructing the store.
    const filePath = path.join(tmpDirHolder.value, 'settings.json');
    const v1: Settings = {
      schemaVersion: 1,
      autoLaunch: true,
      autoSyncEnabled: true,
      autoSyncIntervalMin: 15,
      notifyOnSyncError: false,
      // Stored v1 files don't have these fields, but the schema allows them
      // for forward-compat. Empty arrays simulate the v1 reality.
      enabledBrowsers: [],
      acknowledgedBrowsers: [],
    };
    require('node:fs').writeFileSync(filePath, JSON.stringify(v1));

    const store = new JsonStore<Settings>('settings.json', SettingsSchema, defaultSettings);
    const service = new BrowsersService(store);
    const ran = migrateSettingsV1ToV2(store, service);
    expect(ran).toBe(true);

    const after = store.get();
    expect(after.schemaVersion).toBe(2);
    // Detection mock has chrome+firefox+safari installed-and-detected.
    expect(after.enabledBrowsers.sort()).toEqual(['chrome', 'firefox', 'safari']);
    expect(after.acknowledgedBrowsers.sort()).toEqual(['chrome', 'firefox', 'safari']);
  });

  it('is a no-op for fresh v2 installs (defaults schemaVersion=2)', () => {
    const store = new JsonStore<Settings>('settings.json', SettingsSchema, defaultSettings);
    const service = new BrowsersService(store);
    const ran = migrateSettingsV1ToV2(store, service);
    expect(ran).toBe(false);
    expect(store.get().enabledBrowsers).toEqual([]);
  });
});
