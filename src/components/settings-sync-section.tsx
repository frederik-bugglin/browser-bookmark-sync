'use client';

import { Bell, Clock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNextSyncLabel } from '@/hooks/use-next-sync-label';
import type { AppState, AutoSyncIntervalMin, Settings } from '@/lib/types';

type Props = {
  settings: Settings;
  appState: AppState;
  onChange: (patch: Partial<Settings>) => void;
};

const INTERVAL_OPTIONS: { value: AutoSyncIntervalMin; label: string }[] = [
  { value: 5, label: 'Alle 5 Minuten' },
  { value: 15, label: 'Alle 15 Minuten' },
  { value: 30, label: 'Alle 30 Minuten' },
  { value: 60, label: 'Stündlich' },
];

export function SettingsSyncSection({ settings, appState, onChange }: Props) {
  const nextLabel = useNextSyncLabel(
    settings.autoSyncEnabled ? appState.nextScheduledSyncAt : null,
  );

  const statusLabel = !settings.autoSyncEnabled
    ? 'Auto-Sync ist deaktiviert. Synchronisation läuft nur, wenn du sie manuell auslöst.'
    : appState.lastSyncStatus === 'skipped-offline'
      ? 'Aktuell offline. Sync ist pausiert und läuft automatisch weiter, sobald die Verbindung steht.'
      : nextLabel
        ? `Nächster automatischer Sync ${nextLabel}.`
        : 'Auto-Sync ist aktiv. Erster Lauf startet nach dem nächsten Intervall.';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Synchronisation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="auto-sync-enabled" className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Auto-Sync aktivieren
            </Label>
            <span className="text-xs text-muted-foreground">
              Synchronisiert deine Bookmarks im gewählten Intervall automatisch.
            </span>
          </div>
          <Switch
            id="auto-sync-enabled"
            checked={settings.autoSyncEnabled}
            onCheckedChange={(value) => onChange({ autoSyncEnabled: value })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="auto-sync-interval" className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Intervall
            </Label>
            <span className="text-xs text-muted-foreground">
              Wie oft Junction nach Änderungen schaut.
            </span>
          </div>
          <Select
            value={String(settings.autoSyncIntervalMin)}
            onValueChange={(value) =>
              onChange({ autoSyncIntervalMin: Number(value) as AutoSyncIntervalMin })
            }
            disabled={!settings.autoSyncEnabled}
          >
            <SelectTrigger id="auto-sync-interval" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="notify-on-error" className="flex items-center gap-2 text-sm font-medium">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              Bei Fehler benachrichtigen
            </Label>
            <span className="text-xs text-muted-foreground">
              macOS-Mitteilung, wenn ein Sync fehlschlägt.
            </span>
          </div>
          <Switch
            id="notify-on-error"
            checked={settings.notifyOnSyncError}
            onCheckedChange={(value) => onChange({ notifyOnSyncError: value })}
          />
        </div>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {statusLabel}
        </p>
      </CardContent>
    </Card>
  );
}
