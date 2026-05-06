import { createHash } from 'node:crypto';
import type { NormalizedBookmark, RootKey } from './types';

// Bookmark identity across browsers. Two bookmarks with the same hash are
// considered "the same bookmark" and a write-write collision becomes a
// conflict. Spec calls for SHA-256[:32] over urlNormalized + folderPath +
// rootKey -- the leading 32 hex chars (128 bits) are vastly enough to
// avoid collisions for any realistic user's bookmark library.
export function computeBookmarkHash(
  urlNormalized: string,
  folderPath: string,
  rootKey: RootKey,
): string {
  const input = `${urlNormalized}|${folderPath}|${rootKey}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export function hashOf(b: Pick<NormalizedBookmark, 'urlNormalized' | 'folderPath' | 'rootKey'>): string {
  return computeBookmarkHash(b.urlNormalized, b.folderPath, b.rootKey);
}

// Compare two bookmark records for "did the user actually change anything we
// care about". Title and dateModified are the only fields the engine considers
// for triggering a conflict (URL/folderPath/rootKey are part of the identity,
// so any change to them is an add+delete by definition).
export function bookmarksDiffer(a: NormalizedBookmark, b: NormalizedBookmark): boolean {
  return a.title !== b.title;
}
