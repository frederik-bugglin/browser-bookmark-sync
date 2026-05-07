import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLock, type LockState } from './lock';

export type ChromiumBrowserId = 'chrome' | 'brave' | 'edge' | 'arc' | 'dia';

export type ChromiumBrowserConfig = {
  id: ChromiumBrowserId;
  name: string;
  appBundleNames: string[];
  profileBaseDir: string;
};

export type DetectedBrowser = {
  id: ChromiumBrowserId;
  name: string;
  installed: boolean;
  hasDefaultProfile: boolean;
  profileDir: string;
  bookmarksPath: string;
  lock: LockState;
};

const home = os.homedir();
const support = path.join(home, 'Library/Application Support');

export const CHROMIUM_BROWSERS: ChromiumBrowserConfig[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    appBundleNames: ['Google Chrome.app'],
    profileBaseDir: path.join(support, 'Google/Chrome'),
  },
  {
    id: 'brave',
    name: 'Brave',
    appBundleNames: ['Brave Browser.app'],
    profileBaseDir: path.join(support, 'BraveSoftware/Brave-Browser'),
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    appBundleNames: ['Microsoft Edge.app'],
    profileBaseDir: path.join(support, 'Microsoft Edge'),
  },
  {
    id: 'arc',
    name: 'Arc',
    appBundleNames: ['Arc.app'],
    profileBaseDir: path.join(support, 'Arc/User Data'),
  },
  {
    id: 'dia',
    name: 'Dia',
    appBundleNames: ['Dia.app'],
    profileBaseDir: path.join(support, 'Dia'),
  },
];

const APP_DIRS = ['/Applications', path.join(home, 'Applications')];

function appInstalled(bundleNames: string[]): boolean {
  return bundleNames.some((name) => APP_DIRS.some((dir) => existsSync(path.join(dir, name))));
}

export function detectBrowser(config: ChromiumBrowserConfig): DetectedBrowser {
  const profileDir = path.join(config.profileBaseDir, 'Default');
  const bookmarksPath = path.join(profileDir, 'Bookmarks');
  const installed = appInstalled(config.appBundleNames);
  const hasDefaultProfile = existsSync(bookmarksPath);
  return {
    id: config.id,
    name: config.name,
    installed,
    hasDefaultProfile,
    profileDir,
    bookmarksPath,
    // SingletonLock lives in the user-data root (one level up from "Default"),
    // not in the profile sub-directory. Checking the wrong path silently
    // returned "no-lock" while the browser was actually running, which let
    // writes proceed and Chrome's in-memory state then overwrote our changes.
    lock: hasDefaultProfile
      ? checkLock(config.profileBaseDir)
      : { running: false, reason: 'no-lock' },
  };
}

export function detectAll(): DetectedBrowser[] {
  return CHROMIUM_BROWSERS.map(detectBrowser);
}

export function detectInstalled(): DetectedBrowser[] {
  return detectAll().filter((b) => b.installed && b.hasDefaultProfile);
}
