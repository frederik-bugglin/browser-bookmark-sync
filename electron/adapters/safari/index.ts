export { detectSafari } from './detect';
export type { DetectedSafari } from './detect';

export { readSafariBookmarks, parseSafariPlist } from './read';
export type { SafariRoot } from './read';

export { writeSafariBookmarks } from './write';
export type { WriteOptions } from './write';

export { checkSafariRunning } from './lock';
export type { SafariLockState } from './lock';

export {
  probePermission,
  defaultBookmarksPath,
  safariInstalled,
  FULL_DISK_ACCESS_URL,
} from './permission';
export type { ProbeResult } from './permission';

export {
  ROOT_TO_PATH,
  PATH_TO_ROOT,
  SAFARI_ROOTS,
  SAFARI_TITLE_TO_ROOT,
  ROOT_TO_SAFARI_TITLE,
  READING_LIST_TITLE,
  rootKeyForPath,
  isSafariSyncableRoot,
} from './mapping';

export {
  BrowserRunningError,
  SafariParseError,
  SafariPermissionError,
} from './types';
export type {
  SafariBrowserId,
  RootKey,
  NormalizedBookmark,
  NormalizedFolder,
  NormalizedSnapshot,
} from './types';
