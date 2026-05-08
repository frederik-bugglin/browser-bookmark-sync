'use client';

import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConflictDetailDialog } from '@/components/conflicts/conflict-detail-dialog';
import { ConflictsTable } from '@/components/conflicts/conflicts-table';
import { FilterBar } from '@/components/conflicts/filter-bar';
import { useConflicts } from '@/hooks/use-conflicts';
import { junction } from '@/lib/electron-bridge';
import type { ConflictEntry, ConflictFilter } from '@/lib/types';

const DEFAULT_FILTER: ConflictFilter = { status: 'open', limit: 50 };
const SEARCH_DEBOUNCE_MS = 300;

export default function ConflictsPage() {
  const [filter, setFilter] = useState<ConflictFilter>(DEFAULT_FILTER);
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<ConflictEntry | null>(null);

  // Debounce free-text search so each keystroke doesn't fire a query.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter((f) => ({ ...f, search: searchInput || undefined }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Mark conflicts as seen on mount so the tray badge clears the next time
  // PROJ-7 queries countSinceLastSeen.
  useEffect(() => {
    void junction().conflicts.markSeen();
  }, []);

  const { state, loadMore } = useConflicts(filter);

  const handleFilterChange = (patch: Partial<ConflictFilter>) => {
    if ('search' in patch) {
      setSearchInput(patch.search ?? '');
      return;
    }
    setFilter((f) => ({ ...f, ...patch }));
  };

  const handleReset = () => {
    setSearchInput('');
    setFilter(DEFAULT_FILTER);
  };

  const filterForBar = useMemo(
    () => ({ ...filter, search: searchInput }),
    [filter, searchInput],
  );

  const isFreshFilter =
    !filter.search &&
    !filter.createdFrom &&
    !filter.createdTo &&
    !filter.winnerBrowserIds?.length &&
    !filter.loserBrowserIds?.length &&
    filter.status === 'open';

  return (
    <AppShell>
      <Toaster richColors position="bottom-right" />
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Konflikt-Log</h1>
          <p className="text-sm text-muted-foreground">
            Bookmarks, bei denen zwei Browser unabhängig dieselbe Bookmark verändert haben.
            Letzter Schreiber gewinnt, die Loser-Version landet hier.
          </p>
        </header>

        <FilterBar
          filter={filterForBar}
          onChange={handleFilterChange}
          onReset={handleReset}
          resultCount={state.entries.length}
        />

        {state.error ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Konflikte konnten nicht geladen werden
              </p>
              <p className="max-w-md text-xs text-muted-foreground">{state.error}</p>
            </CardContent>
          </Card>
        ) : state.loading && state.entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">Lade…</p>
            </CardContent>
          </Card>
        ) : state.entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <History className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {isFreshFilter ? 'Bisher kein Konflikt' : 'Keine Konflikte für diesen Filter'}
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                {isFreshFilter
                  ? 'Sync läuft sauber. Sobald derselbe Bookmark in zwei Browsern unterschiedlich verändert wird, landet die verlierende Version hier.'
                  : 'Lockere den Filter oder setze ihn zurück, um mehr zu sehen.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ConflictsTable entries={state.entries} onSelect={setSelected} />
            {state.hasMore ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={state.loading}
                >
                  {state.loading ? 'Lade…' : 'Mehr laden'}
                </Button>
              </div>
            ) : null}
          </>
        )}

        <ConflictDetailDialog
          conflict={selected}
          open={selected !== null}
          onClose={() => setSelected(null)}
        />
      </div>
    </AppShell>
  );
}
