'use client';

import { useEffect, useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SettingsSyncSection } from '@/components/settings-sync-section';
import { SettingsBrowsersCard } from '@/components/settings-browsers-card';
import { junction } from '@/lib/electron-bridge';
import type { AppState, AuthStatus, Settings } from '@/lib/types';

const FALLBACK: Settings = {
  schemaVersion: 2,
  autoLaunch: true,
  autoSyncEnabled: true,
  autoSyncIntervalMin: 15,
  notifyOnSyncError: false,
  enabledBrowsers: [],
  acknowledgedBrowsers: [],
};
const FALLBACK_AUTH: AuthStatus = { state: 'loading' };
const FALLBACK_APP_STATE: AppState = {
  schemaVersion: 2,
  firstLaunchDone: true,
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  nextScheduledSyncAt: null,
  lastConflictsSeenAt: null,
  mainWindowBounds: null,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(FALLBACK);
  const [appState, setAppState] = useState<AppState>(FALLBACK_APP_STATE);
  const [auth, setAuth] = useState<AuthStatus>(FALLBACK_AUTH);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void junction().settings.get().then((s) => {
      if (!cancelled) setSettings(s);
    });
    void junction().appState.get().then((s) => {
      if (!cancelled) setAppState(s);
    });
    void junction().auth.getStatus().then((s) => {
      if (!cancelled) setAuth(s);
    });
    const unsubSettings = junction().settings.subscribe(setSettings);
    const unsubAppState = junction().appState.subscribe(setAppState);
    const unsubAuth = junction().auth.subscribe(setAuth);
    return () => {
      cancelled = true;
      unsubSettings();
      unsubAppState();
      unsubAuth();
    };
  }, []);

  const handleAutoLaunchChange = (value: boolean) => {
    setSettings((s) => ({ ...s, autoLaunch: value }));
    void junction().settings.set({ autoLaunch: value });
  };

  const handleSyncSettingsChange = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    void junction().settings.set(patch);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    // Wait for any active sync to settle so we don't sign out mid-pipeline,
    // which would corrupt the in-flight cloud upsert. UX: button shows
    // "Abmelden..." until idle, then signs out.
    await junction().sync.awaitIdle();
    await junction().auth.signOut();
    await junction().window.showOnboarding();
    setSigningOut(false);
  };

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
          <p className="text-sm text-muted-foreground">
            Account, beteiligte Browser, Synchronisation und App-Verhalten.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {auth.state === 'authenticated' ? auth.email : 'Nicht angemeldet'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {auth.state === 'authenticated'
                    ? 'Bookmarks werden mit deinem Supabase-Account synchronisiert.'
                    : auth.state === 'loading'
                      ? 'Status wird geladen…'
                      : 'Bitte zuerst einloggen.'}
                </span>
              </div>
            </div>
            {auth.state === 'authenticated' ? (
              <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut} className="gap-2">
                <LogOut className="h-4 w-4" />
                {signingOut ? 'Abmelden…' : 'Abmelden'}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <SettingsBrowsersCard />

        <SettingsSyncSection
          settings={settings}
          appState={appState}
          onChange={handleSyncSettingsChange}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allgemein</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="auto-launch" className="text-sm font-medium">
                Beim Login starten
              </Label>
              <span className="text-xs text-muted-foreground">
                Junction startet automatisch nach dem Anmelden am Mac.
              </span>
            </div>
            <Switch id="auto-launch" checked={settings.autoLaunch} onCheckedChange={handleAutoLaunchChange} />
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Folgt in späteren Schritten</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="flex flex-col gap-1.5">
              <li>Konflikt-Log mit Wiederherstellung (PROJ-9)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
