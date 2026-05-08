import type { BrowserId, NormalizedBookmark } from '../sync-engine/types';

export type ConflictStatus = 'open' | 'restored' | 'dismissed';

export type ConflictEntry = {
  id: string;
  bookmarkHash: string;
  winnerVersion: NormalizedBookmark;
  loserVersion: NormalizedBookmark;
  winnerBrowserId: BrowserId;
  loserBrowserId: BrowserId;
  syncRunId: string;
  status: ConflictStatus;
  createdAt: string;
  resolvedAt: string | null;
  restoreOriginId: string | null;
};

export type ConflictFilter = {
  status?: ConflictStatus | 'all';
  winnerBrowserIds?: BrowserId[];
  loserBrowserIds?: BrowserId[];
  /** ISO date strings; both inclusive. */
  createdFrom?: string;
  createdTo?: string;
  /** Free-text search in winner-version title or url (case-insensitive). */
  search?: string;
  /** Page-window. Default offset 0, limit 50. */
  offset?: number;
  limit?: number;
};

export type ConflictListResult = {
  entries: ConflictEntry[];
  hasMore: boolean;
  nextOffset: number | null;
};

export type RestoreResult =
  | { ok: true }
  | { ok: false; reason: 'not-open' | 'offline' | 'unauthenticated' | 'unknown'; message: string };
