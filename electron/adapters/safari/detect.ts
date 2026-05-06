import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSafariRunning, type SafariLockState } from './lock';
import { defaultBookmarksPath, probePermission, safariInstalled } from './permission';

export type DetectedSafari = {
  id: 'safari';
  name: 'Safari';
  installed: boolean;
  // Existence as observed by Junction. With TCC denied this stays `false`
  // because we can't even stat the parent dir. The UI uses this to decide
  // whether to push the user into the permission onboarding.
  hasDefaultProfile: boolean;
  plistPath: string;
  // Selected profile source for transparency in settings.
  profileSource: 'default' | 'profiles' | null;
  permission: 'granted' | 'denied' | 'unavailable';
  permissionCode: string | null;
  lock: SafariLockState;
};

const home = os.homedir();
const SAFARI_DIR = path.join(home, 'Library/Safari');
const PROFILES_DIR = path.join(SAFARI_DIR, 'Profiles');

// Sonoma+ stores per-profile data under ~/Library/Safari/Profiles/<UUID>/.
// MVP: when a non-empty Profiles directory exists, prefer the most recently
// modified profile; otherwise the legacy Default plist at ~/Library/Safari/.
function resolvePlistPath(): { plistPath: string; source: 'default' | 'profiles' | null } {
  if (existsSync(PROFILES_DIR)) {
    try {
      const entries = readdirSync(PROFILES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(PROFILES_DIR, e.name));
      const candidates = entries
        .map((dir) => ({ dir, plist: path.join(dir, 'Bookmarks.plist') }))
        .filter((c) => existsSync(c.plist));
      if (candidates.length > 0) {
        // Sort by mtime desc — most recently used profile wins.
        candidates.sort((a, b) => {
          const aTime = safeMtime(a.plist);
          const bTime = safeMtime(b.plist);
          return bTime - aTime;
        });
        return { plistPath: candidates[0].plist, source: 'profiles' };
      }
    } catch {
      // EACCES on the Profiles dir likely means TCC denied us. Fall through.
    }
  }

  const defaultPath = defaultBookmarksPath();
  return { plistPath: defaultPath, source: 'default' };
}

function safeMtime(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

export function detectSafari(): DetectedSafari {
  const installed = safariInstalled();
  const { plistPath, source } = resolvePlistPath();
  const probe = probePermission(plistPath);

  let permission: 'granted' | 'denied' | 'unavailable';
  let permissionCode: string | null = null;
  let hasDefaultProfile = false;

  if (probe.status === 'granted') {
    permission = 'granted';
    hasDefaultProfile = true;
  } else if (probe.status === 'denied') {
    permission = 'denied';
    permissionCode = probe.code;
    // We can't see the file, so we don't actually know if it exists; assume
    // it does so the UI offers the permission flow rather than skipping Safari.
    hasDefaultProfile = installed;
  } else {
    permission = 'unavailable';
    hasDefaultProfile = false;
  }

  return {
    id: 'safari',
    name: 'Safari',
    installed,
    hasDefaultProfile,
    plistPath,
    profileSource: hasDefaultProfile ? source : null,
    permission,
    permissionCode,
    lock: checkSafariRunning(),
  };
}
