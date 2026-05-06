import { lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';

export type LockState =
  | { running: true; pid: number }
  | { running: false; reason: 'no-lock' | 'stale-pid' | 'unparseable' };

export function checkLock(profileDir: string): LockState {
  const lockPath = path.join(profileDir, 'SingletonLock');

  let target: string;
  try {
    // Use lstat so dangling symlinks still register; existsSync would follow the link.
    lstatSync(lockPath);
    target = readlinkSync(lockPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { running: false, reason: 'no-lock' };
    return { running: false, reason: 'unparseable' };
  }

  const dashIndex = target.lastIndexOf('-');
  if (dashIndex === -1) return { running: false, reason: 'unparseable' };
  const pidStr = target.slice(dashIndex + 1);
  const pid = parseInt(pidStr, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { running: false, reason: 'unparseable' };
  }

  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException).code;
    if (errno === 'EPERM') {
      // Process exists but we can't signal it (different user). Treat as running.
      return { running: true, pid };
    }
    return { running: false, reason: 'stale-pid' };
  }
}
