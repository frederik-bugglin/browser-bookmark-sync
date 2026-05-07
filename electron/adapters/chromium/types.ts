import { z } from 'zod';

const NodeBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  date_added: z.string().optional(),
  date_modified: z.string().optional(),
  date_last_used: z.string().optional(),
  guid: z.string().optional(),
  meta_info: z.record(z.string(), z.any()).optional(),
});

export type ChromiumNode = ChromiumUrlNode | ChromiumFolderNode;

export interface ChromiumUrlNode extends z.infer<typeof NodeBaseSchema> {
  type: 'url';
  url: string;
}

export interface ChromiumFolderNode extends z.infer<typeof NodeBaseSchema> {
  type: 'folder';
  children: ChromiumNode[];
}

const UrlNodeSchema: z.ZodType<ChromiumUrlNode> = NodeBaseSchema.extend({
  type: z.literal('url'),
  url: z.string(),
});

const FolderNodeSchema: z.ZodType<ChromiumFolderNode> = z.lazy(() =>
  NodeBaseSchema.extend({
    type: z.literal('folder'),
    children: z.array(NodeSchema),
  }),
);

const NodeSchema: z.ZodType<ChromiumNode> = z.lazy(() => z.union([UrlNodeSchema, FolderNodeSchema]));

export const ChromiumRootsSchema = z.object({
  bookmark_bar: FolderNodeSchema,
  other: FolderNodeSchema,
  synced: FolderNodeSchema,
});

export type ChromiumRoots = z.infer<typeof ChromiumRootsSchema>;

export const ChromiumBookmarksFileSchema = z.object({
  checksum: z.string(),
  roots: ChromiumRootsSchema,
  version: z.number().optional(),
}).passthrough();

export type ChromiumBookmarksFile = z.infer<typeof ChromiumBookmarksFileSchema>;

export type RootKey = 'bookmark_bar' | 'other' | 'synced';

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

export class ChromiumParseError extends Error {
  constructor(public readonly browserId: string, public readonly cause: unknown) {
    const causeMsg =
      cause instanceof Error
        ? `${cause.name}: ${cause.message}`
        : typeof cause === 'string'
          ? cause
          : '';
    super(
      causeMsg
        ? `Failed to parse bookmarks file for "${browserId}" — ${causeMsg}`
        : `Failed to parse bookmarks file for "${browserId}"`,
    );
    this.name = 'ChromiumParseError';
  }
}
