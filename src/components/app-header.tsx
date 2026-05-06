'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncStatusPill } from '@/components/sync-status-pill';
import type { AppState } from '@/lib/types';

type Props = {
  state: AppState;
  onSyncNow?: () => void;
};

export function AppHeader({ state, onSyncNow }: Props) {
  return (
    <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b px-6">
      <div className="no-drag-region flex items-center gap-3 pl-16">
        <SyncStatusPill status={state.lastSyncStatus} lastSyncAt={state.lastSyncAt} />
      </div>
      <div className="no-drag-region">
        <Button
          size="sm"
          variant="default"
          onClick={onSyncNow}
          disabled={state.lastSyncStatus === 'running'}
          className="gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Jetzt synchronisieren
        </Button>
      </div>
    </header>
  );
}
