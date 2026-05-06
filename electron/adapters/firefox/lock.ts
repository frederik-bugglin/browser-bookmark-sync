import { closeSync, constants, lstatSync, openSync } from 'node:fs';
import path from 'node:path';

// Firefox profile lock detection on macOS.
//
// Firefox uses an fcntl-style exclusive lock on `.parentlock` to mark a profile
// as in-use. We can't see that lock with stat — `.parentlock` always exists
// once Firefox has touched the profile. Instead we *try* to acquire the lock
// ourselves with O_EXLOCK; if Firefox holds it, the open fails with EAGAIN.
//
// Linux uses a `lock` symlink with "ip:+pid" — irrelevant here because Junction
// is macOS-only (see PRD). If we ever support Linux we add a separate branch.

export type LockState =
  | { running: true; pid: number | null }
  | { running: false; reason: 'no-lock' | 'unlocked' | 'unparseable' };

function existsForLock(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export function checkLock(profileDir: string): LockState {
  const parentLockPath = path.join(profileDir, '.parentlock');

  if (!existsForLock(parentLockPath)) {
    // No `.parentlock` at all — Firefox has never run on this profile, or the
    // file has been deleted manually. Either way, no lock to worry about.
    return { running: false, reason: 'no-lock' };
  }

  // O_EXLOCK is a BSD/macOS extension. Node does not expose it in
  // fs.constants but the Darwin kernel value has been stable as 0x20 since
  // before macOS — sourced from <sys/fcntl.h>. Junction is macOS-only (see
  // PRD), so we hardcode it. On any other platform, fall back to "Firefox
  // running unknown" to avoid a destructive write.
  if (process.platform !== 'darwin') {
    return { running: true, pid: null };
  }
  const O_EXLOCK = 0x20;
  const O_NONBLOCK = constants.O_NONBLOCK;

  let fd: number | null = null;
  try {
    fd = openSync(parentLockPath, constants.O_RDWR | O_EXLOCK | O_NONBLOCK);
    // Got the lock — Firefox is not running. Close immediately so we release.
    return { running: false, reason: 'unlocked' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EAGAIN' || code === 'EWOULDBLOCK') {
      return { running: true, pid: null };
    }
    // Any other error (permissions, missing file) — treat as unparseable so
    // the caller can decide whether to proceed.
    return { running: false, reason: 'unparseable' };
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}
