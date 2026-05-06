import { execFileSync } from 'node:child_process';

// Safari has no lock file. We detect "is Safari running" via `pgrep -x Safari`,
// which matches the exact process name only — Safari Web Content workers,
// SearchHelper, and com.apple.WebKit.* helpers are skipped because we only
// care about the main app process (the only one that writes Bookmarks.plist).

export type SafariLockState =
  | { running: true; pid: number }
  | { running: false; reason: 'not-running' | 'pgrep-unavailable' };

export function checkSafariRunning(): SafariLockState {
  if (process.platform !== 'darwin') {
    // Junction is macOS-only (PRD), but in any non-darwin context (CI,
    // cross-compile) treat as "not running" so unit tests can exercise the
    // write path without sudo on the host.
    return { running: false, reason: 'not-running' };
  }

  try {
    const out = execFileSync('/usr/bin/pgrep', ['-x', 'Safari'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 1500,
    });
    const firstLine = out.split('\n')[0]?.trim();
    const pid = firstLine ? Number.parseInt(firstLine, 10) : NaN;
    if (!Number.isFinite(pid) || pid <= 0) {
      return { running: false, reason: 'not-running' };
    }
    return { running: true, pid };
  } catch (err) {
    const code = (err as { code?: string | number; status?: number }).status;
    // pgrep exit 1 means "no match found" — Safari isn't running.
    if (code === 1) {
      return { running: false, reason: 'not-running' };
    }
    // Anything else (binary missing, ENOENT, EACCES) — be conservative and
    // pretend pgrep is unavailable so the caller can decide whether to write.
    return { running: false, reason: 'pgrep-unavailable' };
  }
}
