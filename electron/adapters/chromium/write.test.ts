// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeChecksum } from './checksum';
import { readBookmarks } from './read';
import { writeBookmarks } from './write';
import { ChromiumBookmarksFileSchema, BrowserRunningError } from './types';

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
}));

const fixturePath = path.join(__dirname, '__fixtures__/sample-bookmarks.json');

describe('writeBookmarks', () => {
  let workdir: string;
  let bookmarksPath: string;
  let profileDir: string;
  let userDataDir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(os.tmpdir(), 'junction-write-test-'));
    profileDir = path.join(workdir, 'Default');
    userDataDir = path.join(workdir, 'userData');
    mkdirSync(profileDir, { recursive: true });
    mkdirSync(userDataDir, { recursive: true });
    bookmarksPath = path.join(profileDir, 'Bookmarks');
    copyFileSync(fixturePath, bookmarksPath);
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('round-trip preserves bookmark structure', () => {
    const snapshot = readBookmarks(bookmarksPath, 'chrome');
    writeBookmarks({ bookmarksPath, browserId: 'chrome', profileDir, snapshot, userDataDir });
    const reloaded = readBookmarks(bookmarksPath, 'chrome');

    expect(new Set(reloaded.bookmarks.map((b) => b.title))).toEqual(
      new Set(snapshot.bookmarks.map((b) => b.title)),
    );
    expect(new Set(reloaded.folders.map((f) => f.pathNormalized))).toEqual(
      new Set(snapshot.folders.map((f) => f.pathNormalized)),
    );
  });

  it('produces a checksum that matches our computeChecksum', () => {
    const snapshot = readBookmarks(bookmarksPath, 'chrome');
    writeBookmarks({ bookmarksPath, browserId: 'chrome', profileDir, snapshot, userDataDir });
    const file = ChromiumBookmarksFileSchema.parse(JSON.parse(readFileSync(bookmarksPath, 'utf8')));
    expect(computeChecksum(file.roots)).toBe(file.checksum);
  });

  it('preserves the synced root unchanged', () => {
    const snapshot = readBookmarks(bookmarksPath, 'chrome');
    const originalSynced = JSON.parse(readFileSync(bookmarksPath, 'utf8')).roots.synced;
    writeBookmarks({ bookmarksPath, browserId: 'chrome', profileDir, snapshot, userDataDir });
    const writtenSynced = JSON.parse(readFileSync(bookmarksPath, 'utf8')).roots.synced;
    expect(writtenSynced).toEqual(originalSynced);
  });

  it('writes a backup before overwriting', () => {
    const snapshot = readBookmarks(bookmarksPath, 'chrome');
    writeBookmarks({ bookmarksPath, browserId: 'chrome', profileDir, snapshot, userDataDir });
    const backupRoot = path.join(userDataDir, 'backups', 'chromium', 'chrome');
    expect(existsSync(backupRoot)).toBe(true);
    const files = readdirSync(backupRoot);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.every((f) => f.startsWith('Bookmarks.') && f.endsWith('.json'))).toBe(true);
  });

  it('rotates backups so at most three are kept', () => {
    const snapshot = readBookmarks(bookmarksPath, 'chrome');
    for (let i = 0; i < 5; i++) {
      writeBookmarks({ bookmarksPath, browserId: 'chrome', profileDir, snapshot, userDataDir });
      // Force a different timestamp for the next backup file name.
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin briefly */ }
    }
    const backupRoot = path.join(userDataDir, 'backups', 'chromium', 'chrome');
    const files = readdirSync(backupRoot);
    expect(files.length).toBeLessThanOrEqual(3);
  });

  it('throws BrowserRunningError when SingletonLock points at a live process', () => {
    const snapshot = readBookmarks(bookmarksPath, 'chrome');
    symlinkSync(`${os.hostname()}-${process.pid}`, path.join(profileDir, 'SingletonLock'));
    expect(() =>
      writeBookmarks({ bookmarksPath, browserId: 'chrome', profileDir, snapshot, userDataDir }),
    ).toThrow(BrowserRunningError);
  });
});
