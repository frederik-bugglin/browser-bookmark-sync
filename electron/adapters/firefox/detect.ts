import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLock, type LockState } from './lock';
import { resolveDefaultProfile } from './profiles-ini';

export type FirefoxBrowserId = 'firefox' | 'zen';

export type FirefoxBrowserConfig = {
  id: FirefoxBrowserId;
  name: string;
  appBundleNames: string[];
  profileBaseDir: string;
};

export type DetectedBrowser = {
  id: FirefoxBrowserId;
  name: string;
  installed: boolean;
  hasDefaultProfile: boolean;
  profileDir: string;
  placesPath: string;
  lock: LockState;
  defaultSource: 'installs.ini' | 'profiles.ini-default' | 'first-profile' | null;
};

const home = os.homedir();
const support = path.join(home, 'Library/Application Support');

export const FIREFOX_BROWSERS: FirefoxBrowserConfig[] = [
  {
    id: 'firefox',
    name: 'Firefox',
    appBundleNames: ['Firefox.app', 'Firefox Developer Edition.app', 'Firefox Nightly.app'],
    profileBaseDir: path.join(support, 'Firefox'),
  },
  {
    id: 'zen',
    name: 'Zen',
    appBundleNames: ['Zen.app', 'Zen Browser.app'],
    profileBaseDir: path.join(support, 'zen'),
  },
];

const APP_DIRS = ['/Applications', path.join(home, 'Applications')];

function appInstalled(bundleNames: string[]): boolean {
  return bundleNames.some((name) => APP_DIRS.some((dir) => existsSync(path.join(dir, name))));
}

export function detectBrowser(config: FirefoxBrowserConfig): DetectedBrowser {
  const installed = appInstalled(config.appBundleNames);
  const profilesIniPath = path.join(config.profileBaseDir, 'profiles.ini');
  const installsIniPath = path.join(config.profileBaseDir, 'installs.ini');

  const resolved = resolveDefaultProfile({
    profilesIniPath,
    installsIniPath,
    baseDir: config.profileBaseDir,
  });

  const profileDir = resolved?.profileDir ?? '';
  const placesPath = profileDir ? path.join(profileDir, 'places.sqlite') : '';
  const hasDefaultProfile = placesPath !== '' && existsSync(placesPath);

  return {
    id: config.id,
    name: config.name,
    installed,
    hasDefaultProfile,
    profileDir,
    placesPath,
    lock: hasDefaultProfile ? checkLock(profileDir) : { running: false, reason: 'no-lock' },
    defaultSource: resolved?.source ?? null,
  };
}

export function detectAll(): DetectedBrowser[] {
  return FIREFOX_BROWSERS.map(detectBrowser);
}

export function detectInstalled(): DetectedBrowser[] {
  return detectAll().filter((b) => b.installed && b.hasDefaultProfile);
}
