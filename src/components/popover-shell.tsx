'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { SyncStatusPill } from '@/components/sync-status-pill';
import { BrowserListCompact } from '@/components/browser-list-compact';
import { junction } from '@/lib/electron-bridge';
import type { AppState } from '@/lib/types';

const FALLBACK_STATE: AppState = {
  schemaVersion: 1,
  firstLaunchDone: true,
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  mainWindowBounds: null,
};

export function PopoverShell() {
  const [state, setState] = useState<AppState>(FALLBACK_STATE);

  useEffect(() => {
    let cancelled = false;
    void junction().appState.get().then((s) => {
      if (!cancelled) setState(s);
    });
    const unsubscribe = junction().appState.subscribe(setState);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleSync = () => {
    void junction().appState.set({ lastSyncStatus: 'running' });
    setTimeout(() => {
      void junction().appState.set({
        lastSyncStatus: 'success',
        lastSyncAt: new Date().toISOString(),
      });
    }, 1200);
  };

  const handleOpenMain = () => {
    void junction().window.showMain();
    void junction().window.hidePopover();
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <BrandMark size={20} showWordmark />
      </div>
      <div className="border-b px-4 py-3">
        <SyncStatusPill status={state.lastSyncStatus} lastSyncAt={state.lastSyncAt} />
      </div>
      <div className="flex-1 overflow-auto px-2 py-2">
        <BrowserListCompact />
      </div>
      <div className="flex flex-col gap-2 border-t px-4 py-3">
        <Button
          size="sm"
          onClick={handleSync}
          disabled={state.lastSyncStatus === 'running'}
          className="w-full gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Jetzt synchronisieren
        </Button>
        <Button size="sm" variant="ghost" onClick={handleOpenMain} className="w-full gap-2">
          <ExternalLink className="h-3.5 w-3.5" />
          Hauptfenster öffnen
        </Button>
      </div>
    </div>
  );
}
