// Firefox places.sqlite root identifiers (moz_bookmarks).
// IDs are stable since Firefox 67. GUIDs are the canonical reference and
// are guaranteed to exist on every profile.

import type { RootKey } from './types';

export const ROOT_GUIDS: Record<RootKey, string> = {
  toolbar: 'toolbar_____',
  unfiled: 'unfiled_____',
  mobile: 'mobile______',
  menu: 'menu________',
};

export const TAGS_GUID = 'tags________';

// moz_bookmarks.type values
export const BMK_TYPE_URL = 1;
export const BMK_TYPE_FOLDER = 2;
export const BMK_TYPE_SEPARATOR = 3;

// Default frecency for newly inserted moz_places rows: -1 means "needs recalc".
// Firefox recalculates lazily, no harm in setting it on insert.
export const FRECENCY_NEEDS_RECALC = -1;
