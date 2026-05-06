import type { RootKey } from './types';

export const ROOT_TO_PATH: Record<RootKey, string> = {
  toolbar: '/lesezeichenleiste',
  unfiled: '/andere-lesezeichen',
  mobile: '/synchronisiert',
  menu: '/lesezeichen-menu',
};

export const PATH_TO_ROOT: Record<string, RootKey> = Object.fromEntries(
  Object.entries(ROOT_TO_PATH).map(([key, value]) => [value, key as RootKey]),
);

// Synced is read-only on the Chromium side; on Firefox the same applies because
// the mobile root is managed by Firefox Sync. Junction never overwrites it.
export const READ_ONLY_ROOTS: ReadonlySet<RootKey> = new Set<RootKey>(['mobile']);

export function rootKeyForPath(folderPath: string): RootKey | null {
  if (!folderPath || folderPath === '/') return null;
  for (const [path, key] of Object.entries(PATH_TO_ROOT)) {
    if (folderPath === path || folderPath.startsWith(`${path}/`)) {
      return key;
    }
  }
  return null;
}

export function isReadOnlyPath(folderPath: string): boolean {
  const key = rootKeyForPath(folderPath);
  return key !== null && READ_ONLY_ROOTS.has(key);
}
