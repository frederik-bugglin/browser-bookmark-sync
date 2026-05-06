// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSync, constants, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLock } from './lock';

describe('checkLock (firefox, macOS fcntl)', () => {
  let tmpDir: string;
  let parentLock: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-firefox-lock-'));
    parentLock = path.join(tmpDir, '.parentlock');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports no-lock when .parentlock is absent', () => {
    expect(checkLock(tmpDir)).toEqual({ running: false, reason: 'no-lock' });
  });

  it('reports unlocked when .parentlock exists but no process holds it', () => {
    writeFileSync(parentLock, '');
    const result = checkLock(tmpDir);
    expect(result).toEqual({ running: false, reason: 'unlocked' });
  });

  it('detects a held lock via O_EXLOCK', () => {
    const O_EXLOCK = (constants as Record<string, number>).O_EXLOCK;
    if (typeof O_EXLOCK !== 'number') {
      // Skip on non-macOS hosts — the test relies on BSD O_EXLOCK semantics.
      return;
    }
    writeFileSync(parentLock, '');
    // Hold the lock from this process — checkLock will then fail to acquire.
    const fd = openSync(parentLock, constants.O_RDWR | O_EXLOCK);
    try {
      const result = checkLock(tmpDir);
      expect(result).toEqual({ running: true, pid: null });
    } finally {
      closeSync(fd);
    }
  });
});
