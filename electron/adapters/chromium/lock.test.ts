// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLock } from './lock';

describe('checkLock', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-lock-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports not-running when SingletonLock is absent', () => {
    expect(checkLock(tmpDir)).toEqual({ running: false, reason: 'no-lock' });
  });

  it('detects a running process via the current pid', () => {
    const target = `${os.hostname()}-${process.pid}`;
    symlinkSync(target, path.join(tmpDir, 'SingletonLock'));
    const result = checkLock(tmpDir);
    expect(result).toEqual({ running: true, pid: process.pid });
  });

  it('reports stale-pid when the pid no longer exists', () => {
    // Use a pid that almost certainly does not exist.
    const target = `${os.hostname()}-99999999`;
    symlinkSync(target, path.join(tmpDir, 'SingletonLock'));
    const result = checkLock(tmpDir);
    expect(result).toEqual({ running: false, reason: 'stale-pid' });
  });

  it('reports unparseable when the symlink target has no pid suffix', () => {
    symlinkSync('weird-no-dash', path.join(tmpDir, 'SingletonLock'));
    expect(checkLock(tmpDir)).toEqual({ running: false, reason: 'unparseable' });
  });

  it('reports unparseable when the pid suffix is non-numeric', () => {
    symlinkSync('host-notapid', path.join(tmpDir, 'SingletonLock'));
    expect(checkLock(tmpDir)).toEqual({ running: false, reason: 'unparseable' });
  });

  it('does not crash on a regular file (not a symlink) at the lock path', () => {
    writeFileSync(path.join(tmpDir, 'SingletonLock'), 'not a symlink');
    const result = checkLock(tmpDir);
    expect(result.running).toBe(false);
  });
});
