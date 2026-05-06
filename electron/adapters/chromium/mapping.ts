import type { RootKey } from './types';

export const ROOT_TO_PATH: Record<RootKey, string> = {
  bookmark_bar: '/lesezeichenleiste',
  other: '/andere-lesezeichen',
  synced: '/synchronisiert',
};

export const PATH_TO_ROOT: Record<string, RootKey> = {
  '/lesezeichenleiste': 'bookmark_bar',
  '/andere-lesezeichen': 'other',
  '/synchronisiert': 'synced',
};

export const READ_ONLY_ROOTS: ReadonlySet<RootKey> = new Set<RootKey>(['synced']);

export function rootKeyForPath(path: string): RootKey | null {
  for (const [prefix, root] of Object.entries(PATH_TO_ROOT)) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return root as RootKey;
    }
  }
  return null;
}

export function isReadOnlyPath(path: string): boolean {
  const root = rootKeyForPath(path);
  return root !== null && READ_ONLY_ROOTS.has(root);
}
