'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { SyncStatusPill } from '@/components/sync-status-pill';
import { BrowserListCompact } from '@/components/browser-list-compact';
import { junction } from '@/lib/electron-bridge';
import { useNextSyncLabel } from '@/hooks/use-next-sync-label';
import type { AppState, Settings } from '@/lib/types';

const FALLBACK_STATE: AppState = {
  schemaVersion: 2,
  firstLaunchDone: true,
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  nextScheduledSyncAt: null,
  lastConflictsSeenAt: null,
  mainWindowBounds: null,
};

const FALLBACK_SETTINGS: Settings = {
  schemaVersion: 2,
  autoLaunch: true,
  autoSyncEnabled: true,
  autoSyncIntervalMin: 15,
  notifyOnSyncError: false,
  enabledBrowsers: [],
  acknowledgedBrowsers: [],
};

export function PopoverShell() {
  const [state, setState] = useState<AppState>(FALLBACK_STATE);
  const [settings, setSettings] = useState<Settings>(FALLBACK_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    void junction().appState.get().then((s) => {
      if (!cancelled) setState(s);
    });
    void junction().settings.get().then((s) => {
      if (!cancelled) setSettings(s);
    });
    const unsubState = junction().appState.subscribe(setState);
    const unsubSettings = junction().settings.subscribe(setSettings);
    return () => {
      cancelled = true;
      unsubState();
      unsubSettings();
    };
  }, []);

  const handleSync = async () => {
    try {
      await junction().sync.run('manual');
    } catch {
      // Error wird über AppState.lastSyncStatus = 'error' im Pill sichtbar.
      // Kein Toast hier, der Popover ist platzbeschränkt.
    }
  };

  const handleOpenMain = () => {
    void junction().window.showMain();
    void junction().window.hidePopover();
  };

  const nextLabel = useNextSyncLabel(
    settings.autoSyncEnabled ? state.nextScheduledSyncAt : null,
  );
  const footerHint = !settings.autoSyncEnabled
    ? 'Auto-Sync aus'
    : state.lastSyncStatus === 'skipped-offline'
      ? 'Sync pausiert · offline'
      : nextLabel
        ? `Nächster Sync ${nextLabel}`
        : null;

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
        {footerHint && (
          <p className="pt-1 text-center text-[11px] text-muted-foreground">{footerHint}</p>
        )}
      </div>
    </div>
  );
}
