export type FirefoxBrowserId = 'firefox' | 'zen';

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

export class FirefoxParseError extends Error {
  constructor(public readonly browserId: string, public readonly cause: unknown) {
    super(`Failed to read places.sqlite for "${browserId}"`);
    this.name = 'FirefoxParseError';
  }
}
