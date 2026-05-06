// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultBookmarksPath, probePermission, FULL_DISK_ACCESS_URL } from './permission';

describe('permission probe', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-safari-perm-'));
  });

  afterEach(() => {
    // Restore perms before deletion or rmSync chokes on locked files.
    try {
      chmodSync(tmpDir, 0o700);
    } catch {
      // ignore
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaultBookmarksPath points into the user library', () => {
    expect(defaultBookmarksPath()).toContain(path.join(os.homedir(), 'Library/Safari'));
  });

  it('TCC deeplink URL is the verified macOS 14-15 form', () => {
    expect(FULL_DISK_ACCESS_URL).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
    );
  });

  it('returns granted when the plist exists and is readable', () => {
    const plistPath = path.join(tmpDir, 'Bookmarks.plist');
    writeFileSync(plistPath, 'bplist00fake');
    const result = probePermission(plistPath);
    // On a system without Safari installed in /Applications/Safari.app,
    // this branch returns "unavailable: no-safari". Otherwise "granted".
    if (result.status === 'unavailable' && result.reason === 'no-safari') {
      // Tolerated: CI without Safari. The probe is correctly short-circuiting.
      return;
    }
    expect(result.status).toBe('granted');
  });

  it('returns unavailable when the plist does not exist', () => {
    const result = probePermission(path.join(tmpDir, 'does-not-exist.plist'));
    if (result.status === 'unavailable' && result.reason === 'no-safari') return;
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toBe('no-plist');
  });

  it('returns denied when the file is unreadable (EACCES)', () => {
    // We can only meaningfully exercise EACCES when not running as root.
    // Skip when uid 0.
    if (process.getuid?.() === 0) return;
    const plistPath = path.join(tmpDir, 'Bookmarks.plist');
    writeFileSync(plistPath, 'bplist00fake');
    chmodSync(plistPath, 0o000);
    const result = probePermission(plistPath);
    if (result.status === 'unavailable' && result.reason === 'no-safari') return;
    expect(result.status).toBe('denied');
    if (result.status === 'denied') expect(['EACCES', 'EPERM']).toContain(result.code);
  });
});
