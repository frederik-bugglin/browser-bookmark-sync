export { detectAll, detectInstalled, detectBrowser, FIREFOX_BROWSERS } from './detect';
export type { DetectedBrowser, FirefoxBrowserConfig } from './detect';

export { readBookmarks } from './read';
export { writeBookmarks } from './write';
export type { WriteOptions } from './write';

export { checkLock } from './lock';
export type { LockState } from './lock';

export { ROOT_TO_PATH, PATH_TO_ROOT, READ_ONLY_ROOTS, isReadOnlyPath, rootKeyForPath } from './mapping';
export { ROOT_GUIDS } from './schema';

export { parseIni, listProfiles, resolveDefaultProfile } from './profiles-ini';
export type { ProfileEntry, ResolvedProfile, IniFile } from './profiles-ini';

export {
  BrowserRunningError,
  FirefoxParseError,
} from './types';
export type {
  FirefoxBrowserId,
  NormalizedBookmark,
  NormalizedFolder,
  NormalizedSnapshot,
  RootKey,
} from './types';
