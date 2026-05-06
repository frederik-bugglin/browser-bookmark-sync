// Adapter facades. Each driver wraps one browser adapter and exposes a
// uniform interface to the engine pipeline. Drivers also encapsulate the
// per-adapter parameter shape (placesPath, bookmarksPath, plistPath) so
// the engine never needs to know about it.
//
// Tests pass mock drivers that record calls; production wires the real
// adapter modules through createRealDrivers().

import * as chromium from '../adapters/chromium';
import * as firefox from '../adapters/firefox';
import * as safari from '../adapters/safari';
import { isValidBrowserId } from './browser-id';
import type {
  BrowserId,
  BrowserPlan,
  NormalizedSnapshot,
} from './types';

export type BrowserDriver = {
  browserId: BrowserId;
  plan(): BrowserPlan;
  read(): NormalizedSnapshot;
  write(snapshot: NormalizedSnapshot): void;
  /** Re-read the browser after a write. Only Safari needs this for the race mitigation. */
  reread?(): NormalizedSnapshot;
};

export type DriverDeps = {
  /** Override Electron's userData dir (used for tests). */
  userDataDir?: string;
};

// --- Chromium family -----------------------------------------------------

// Chromium adapter uses its own RootKey strings (`bookmark_bar` / `other` /
// `synced`); the engine works in the canonical (`toolbar` / `unfiled` /
// `mobile`) namespace. Translate at the driver boundary.
const CHROMIUM_TO_ENGINE_ROOT: Record<chromium.RootKey, 'toolbar' | 'unfiled' | 'mobile'> = {
  bookmark_bar: 'toolbar',
  other: 'unfiled',
  synced: 'mobile',
};

const ENGINE_TO_CHROMIUM_ROOT: Record<'toolbar' | 'unfiled' | 'mobile', chromium.RootKey> = {
  toolbar: 'bookmark_bar',
  unfiled: 'other',
  mobile: 'synced',
};

function chromiumSnapshotToEngine(s: chromium.NormalizedSnapshot): NormalizedSnapshot {
  return {
    browserId: s.browserId,
    folders: s.folders.map((f) => ({
      ...f,
      rootKey: CHROMIUM_TO_ENGINE_ROOT[f.rootKey],
    })),
    bookmarks: s.bookmarks.map((b) => ({
      ...b,
      rootKey: CHROMIUM_TO_ENGINE_ROOT[b.rootKey],
    })),
  };
}

function engineSnapshotToChromium(s: NormalizedSnapshot): chromium.NormalizedSnapshot {
  // Engine `menu` has no Chromium equivalent; route those into `other` so we
  // don't drop them silently. (The route module already keeps `menu` rare.)
  const toChromiumRoot = (rk: NormalizedSnapshot['bookmarks'][number]['rootKey']): chromium.RootKey => {
    if (rk === 'menu') return 'other';
    return ENGINE_TO_CHROMIUM_ROOT[rk];
  };
  return {
    browserId: s.browserId,
    folders: s.folders.map((f) => ({
      ...f,
      rootKey: toChromiumRoot(f.rootKey),
    })),
    bookmarks: s.bookmarks.map((b) => ({
      ...b,
      rootKey: toChromiumRoot(b.rootKey),
    })),
  };
}

function chromiumDriver(
  detected: chromium.DetectedBrowser,
  deps: DriverDeps,
): BrowserDriver {
  const browserId = detected.id as BrowserId;
  return {
    browserId,
    plan() {
      if (!detected.installed) return { browserId, reason: 'not-installed' };
      if (!detected.hasDefaultProfile) return { browserId, reason: 'no-default-profile' };
      // Chromium adapters don't gate on lock for reads (we copy the file);
      // writes will throw BrowserRunningError if the browser is up.
      return { browserId, reason: 'eligible' };
    },
    read() {
      return chromiumSnapshotToEngine(chromium.readBookmarks(detected.bookmarksPath, browserId));
    },
    write(snapshot) {
      chromium.writeBookmarks({
        bookmarksPath: detected.bookmarksPath,
        browserId,
        profileDir: detected.profileDir,
        snapshot: engineSnapshotToChromium(snapshot),
        userDataDir: deps.userDataDir,
      });
    },
  };
}

// --- Firefox family ------------------------------------------------------

function firefoxDriver(
  detected: firefox.DetectedBrowser,
  deps: DriverDeps,
): BrowserDriver {
  const browserId = detected.id as BrowserId;
  return {
    browserId,
    plan() {
      if (!detected.installed) return { browserId, reason: 'not-installed' };
      if (!detected.hasDefaultProfile) return { browserId, reason: 'no-default-profile' };
      // Lock state matters here: Firefox holds a process lock on the
      // profile, and writing while it's held is destructive.
      if (detected.lock.running) {
        return {
          browserId,
          reason: 'browser-running-write',
          detail: 'Firefox holds the profile lock; close Firefox to sync.',
        };
      }
      return { browserId, reason: 'eligible' };
    },
    read() {
      return firefox.readBookmarks(detected.placesPath, browserId);
    },
    write(snapshot) {
      firefox.writeBookmarks({
        placesPath: detected.placesPath,
        browserId,
        profileDir: detected.profileDir,
        snapshot,
        userDataDir: deps.userDataDir,
      });
    },
  };
}

// --- Safari --------------------------------------------------------------

function safariDriver(
  detected: safari.DetectedSafari,
  deps: DriverDeps,
): BrowserDriver {
  const browserId: BrowserId = 'safari';
  return {
    browserId,
    plan() {
      if (!detected.installed) return { browserId, reason: 'not-installed' };
      if (detected.permission === 'denied') {
        return {
          browserId,
          reason: 'permission-denied',
          detail: 'Full Disk Access is required for Safari.',
        };
      }
      if (detected.permission === 'unavailable') {
        return { browserId, reason: 'no-default-profile' };
      }
      if (detected.lock.running) {
        return {
          browserId,
          reason: 'browser-running-write',
          detail: 'Safari is open; bookmark writes might race.',
        };
      }
      return { browserId, reason: 'eligible' };
    },
    read() {
      return safari.readSafariBookmarks(detected.plistPath, browserId);
    },
    write(snapshot) {
      safari.writeSafariBookmarks({
        plistPath: detected.plistPath,
        browserId,
        snapshot,
        userDataDir: deps.userDataDir,
      });
    },
    reread() {
      return safari.readSafariBookmarks(detected.plistPath, browserId);
    },
  };
}

// --- Factory --------------------------------------------------------------

export function createRealDrivers(deps: DriverDeps = {}): BrowserDriver[] {
  const drivers: BrowserDriver[] = [];

  for (const detected of chromium.detectAll()) {
    if (!isValidBrowserId(detected.id)) continue;
    drivers.push(chromiumDriver(detected, deps));
  }

  for (const detected of firefox.detectAll()) {
    if (!isValidBrowserId(detected.id)) continue;
    drivers.push(firefoxDriver(detected, deps));
  }

  drivers.push(safariDriver(safari.detectSafari(), deps));

  return drivers;
}
