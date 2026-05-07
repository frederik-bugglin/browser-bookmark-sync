export type SafariBrowserId = 'safari';

// Safari has no `mobile`/`synced` root: iCloud propagates writes to iOS
// transparently via the same plist. We expose the same RootKey type as the
// other adapters so the sync engine treats every browser uniformly.
export type RootKey = 'toolbar' | 'unfiled' | 'mobile' | 'menu';

export type NormalizedFolder = {
  id: string;
  name: string;
  pathNormalized: string;
  parentPath: string | null;
  rootKey: RootKey;
  dateAdded: string | null;
  dateModified: string | null;
};

export type NormalizedBookmark = {
  id: string;
  url: string;
  urlNormalized: string;
  title: string;
  folderPath: string;
  rootKey: RootKey;
  dateAdded: string | null;
  dateModified: string | null;
};

export type NormalizedSnapshot = {
  browserId: string;
  folders: NormalizedFolder[];
  bookmarks: NormalizedBookmark[];
};

export class BrowserRunningError extends Error {
  constructor(
    public readonly browserId: string,
    public readonly pid: number | null,
  ) {
    super(`Browser "${browserId}" is currently running${pid ? ` (pid ${pid})` : ''}`);
    this.name = 'BrowserRunningError';
  }
}

export class SafariPermissionError extends Error {
  constructor(public readonly plistPath: string, public readonly cause: unknown) {
    super(`Full Disk Access required to read ${plistPath}`);
    this.name = 'SafariPermissionError';
  }
}

export class SafariParseError extends Error {
  constructor(public readonly plistPath: string, public readonly cause: unknown) {
    const causeMsg =
      cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : typeof cause === 'string'
          ? cause
          : '';
    super(
      causeMsg
        ? `Failed to parse Safari Bookmarks.plist at ${plistPath} — ${causeMsg}`
        : `Failed to parse Safari Bookmarks.plist at ${plistPath}`,
    );
    this.name = 'SafariParseError';
  }
}
