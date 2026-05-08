'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { junction } from '@/lib/electron-bridge';
import type { ConflictEntry, ConflictFilter, ConflictListResult } from '@/lib/types';

type State = {
  entries: ConflictEntry[];
  hasMore: boolean;
  nextOffset: number | null;
  loading: boolean;
  error: string | null;
};

const INITIAL: State = {
  entries: [],
  hasMore: false,
  nextOffset: null,
  loading: true,
  error: null,
};

// Fetches a filtered list of conflicts. Refetches when filter changes (debounced
// via the caller) and when the main process broadcasts conflicts:changed.
export function useConflicts(filter: ConflictFilter): {
  state: State;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<State>(INITIAL);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const fetchPage = useCallback(async (f: ConflictFilter, append: boolean) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result: ConflictListResult = await junction().conflicts.list(f);
      setState((s) => ({
        entries: append ? [...s.entries, ...result.entries] : result.entries,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
        loading: false,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as Error).message ?? 'Unbekannter Fehler.',
      }));
    }
  }, []);

  // Reset and refetch whenever the filter signature changes. Each filter
  // dimension is listed individually so the effect only fires on real value
  // changes — including the multi-select arrays joined into a stable string.
  useEffect(() => {
    void fetchPage({ ...filterRef.current, offset: 0 }, false);
  }, [
    fetchPage,
    filter.status,
    filter.search,
    filter.createdFrom,
    filter.createdTo,
    filter.winnerBrowserIds?.join(','),
    filter.loserBrowserIds?.join(','),
  ]);

  // Re-fetch when main-process emits change (after restore/dismiss).
  useEffect(() => {
    const unsub = junction().conflicts.subscribe(() => {
      void fetchPage({ ...filterRef.current, offset: 0 }, false);
    });
    return unsub;
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (state.nextOffset === null) return;
    await fetchPage({ ...filterRef.current, offset: state.nextOffset }, true);
  }, [fetchPage, state.nextOffset]);

  const refresh = useCallback(async () => {
    await fetchPage({ ...filterRef.current, offset: 0 }, false);
  }, [fetchPage]);

  return { state, loadMore, refresh };
}
