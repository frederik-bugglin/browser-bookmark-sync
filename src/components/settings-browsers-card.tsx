'use client';

import { Info, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { junction } from '@/lib/electron-bridge';
import type { BrowserStatus } from '@/lib/types';
import { useBrowsers } from '@/hooks/use-browsers';

export function SettingsBrowsersCard() {
  const browsers = useBrowsers();

  // Detected-and-installed browsers the user hasn't seen yet sit in the
  // "Neu erkannt" group above the main list with explicit accept/ignore.
  const newBrowsers = browsers.filter((b) => b.installed && b.detected && !b.acknowledged);
  const mainListBrowsers = browsers.filter((b) => b.acknowledged);
  const activeCount = browsers.filter((b) => b.enabled && b.installed && b.detected).length;
  // Show the iCloud caveat for any Safari setup the user has acknowledged —
  // even when the toggle is off or FDA is missing, because that is exactly
  // when "I added a bookmark but nothing synced" confusion shows up.
  const safariAcknowledged = browsers.some((b) => b.id === 'safari' && b.acknowledged);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Browser</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {newBrowsers.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Neu erkannt</span>
            </div>
            <ul className="flex flex-col gap-2">
              {newBrowsers.map((b) => (
                <NewBrowserRow key={b.id} browser={b} />
              ))}
            </ul>
          </div>
        ) : null}

        {mainListBrowsers.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Noch keine Browser bestätigt. Sobald Junction einen Browser erkennt, fragt sie hier nach.
          </p>
        ) : (
          <ul className="flex flex-col">
            {mainListBrowsers.map((b) => (
              <BrowserRow key={b.id} browser={b} />
            ))}
          </ul>
        )}

        {activeCount === 0 && mainListBrowsers.length > 0 ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Aktuell ist kein Browser am Sync beteiligt. Junction läuft trotzdem gegen die Cloud, ändert aber lokal nichts.
          </p>
        ) : null}

        {safariAcknowledged ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-medium">Hinweis zu Safari mit iCloud-Sync:</span>{' '}
              Neu hinzugefügte Bookmarks schreibt Safari nicht sofort auf die Festplatte —
              sie leben zuerst nur in iCloud + RAM. Junction sieht sie erst nach kurzer
              Verzögerung. Falls ein neuer Bookmark direkt nach dem Anlegen nicht
              synchronisiert wird: ein paar Minuten warten oder den Bookmark in Safari
              einmal verschieben/bearbeiten, dann erneut synchronisieren.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NewBrowserRow({ browser }: { browser: BrowserStatus }) {
  const enable = () => {
    void junction().browsers.setEnabled(browser.id, true);
  };
  const ignore = () => {
    void junction().browsers.acknowledge(browser.id);
  };
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium">{browser.name}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={ignore} className="h-7 px-2 text-xs">
          Ignorieren
        </Button>
        <Button size="sm" onClick={enable} className="h-7 px-3 text-xs">
          Aktivieren
        </Button>
      </div>
    </li>
  );
}

function BrowserRow({ browser }: { browser: BrowserStatus }) {
  const switchId = `browser-toggle-${browser.id}`;
  const handleToggle = (next: boolean) => {
    void junction().browsers.setEnabled(browser.id, next);
  };
  const openPermissions = () => {
    void junction().browsers.openPermissions(browser.id);
  };

  const status = describeStatus(browser);
  const canToggle = browser.installed && browser.detected && browser.permissionsOk;

  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/40 py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={switchId} className="text-sm font-medium">
          {browser.name}
        </Label>
        <span className={`text-xs ${status.tone}`}>{status.label}</span>
      </div>
      <div className="flex items-center gap-3">
        {!browser.permissionsOk && browser.installed ? (
          <Button size="sm" variant="outline" onClick={openPermissions} className="h-8 text-xs">
            Erlauben
          </Button>
        ) : null}
        <Switch
          id={switchId}
          checked={browser.enabled}
          onCheckedChange={handleToggle}
          disabled={!canToggle}
          aria-label={`${browser.name} im Sync ein- oder ausschalten`}
        />
      </div>
    </li>
  );
}

type StatusDescription = { label: string; tone: string };

function describeStatus(b: BrowserStatus): StatusDescription {
  if (!b.installed) {
    return { label: 'nicht installiert', tone: 'text-muted-foreground' };
  }
  if (!b.permissionsOk) {
    return { label: 'Permission fehlt', tone: 'text-amber-600 dark:text-amber-400' };
  }
  if (!b.detected) {
    return { label: 'kein Profil gefunden', tone: 'text-muted-foreground' };
  }
  return b.enabled
    ? { label: 'aktiv im Sync', tone: 'text-emerald-600 dark:text-emerald-400' }
    : { label: 'aus', tone: 'text-muted-foreground' };
}
