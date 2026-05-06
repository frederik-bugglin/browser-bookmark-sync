import { accessSync, constants, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// macOS opens the Full Disk Access pane in System Settings via this
// x-apple.systempreferences URL. Verified on macOS 14-15.
export const FULL_DISK_ACCESS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

export type ProbeResult =
  | { status: 'granted'; plistPath: string }
  | { status: 'denied'; plistPath: string; code: string }
  | { status: 'unavailable'; reason: 'no-plist' | 'no-safari' };

export function defaultBookmarksPath(): string {
  return path.join(os.homedir(), 'Library/Safari/Bookmarks.plist');
}

// Safari's binary is bundled with macOS, so checking for /Applications/Safari.app
// is enough — there's no third-party install path. Used as the lightweight
// "is Safari even on this Mac" signal before we probe TCC.
export function safariInstalled(): boolean {
  return existsSync('/Applications/Safari.app');
}

// Probe Full Disk Access on a single Safari plist. We use accessSync(R_OK)
// because TCC denial surfaces as EACCES on macOS, while a missing file (Safari
// installed but never launched) surfaces as ENOENT.
export function probePermission(plistPath: string): ProbeResult {
  if (!safariInstalled()) {
    return { status: 'unavailable', reason: 'no-safari' };
  }

  try {
    accessSync(plistPath, constants.R_OK);
    // Re-check existence: accessSync passes on directories, symlinks, etc.
    // We need a real readable file to call this "granted".
    if (!existsSync(plistPath)) {
      return { status: 'unavailable', reason: 'no-plist' };
    }
    return { status: 'granted', plistPath };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    if (code === 'ENOENT') {
      // The plist truly doesn't exist (Safari never opened, or the user wiped
      // it). Not a permission problem — just nothing to sync.
      return { status: 'unavailable', reason: 'no-plist' };
    }
    // EACCES on macOS = TCC blocks us. EPERM occasionally too. Treat as denied.
    return { status: 'denied', plistPath, code };
  }
}
