'use client';

import { useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { junction } from '@/lib/electron-bridge';
import type { AppState } from '@/lib/types';

const FALLBACK_STATE: AppState = {
  schemaVersion: 1,
  firstLaunchDone: true,
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  nextScheduledSyncAt: null,
  mainWindowBounds: null,
};

export function AppShell({ children }: { children: React.ReactNode }) {
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

  const handleSyncNow = async () => {
    try {
      await junction().sync.run('manual');
    } catch {
      // Error wird über AppState.lastSyncStatus = 'error' im Pill sichtbar.
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader state={state} onSyncNow={handleSyncNow} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
