'use client';

import { useEffect, useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { junction } from '@/lib/electron-bridge';
import type { AuthStatus, Settings } from '@/lib/types';

const FALLBACK: Settings = { schemaVersion: 1, autoLaunch: true };
const FALLBACK_AUTH: AuthStatus = { state: 'loading' };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(FALLBACK);
  const [auth, setAuth] = useState<AuthStatus>(FALLBACK_AUTH);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void junction().settings.get().then((s) => {
      if (!cancelled) setSettings(s);
    });
    void junction().auth.getStatus().then((s) => {
      if (!cancelled) setAuth(s);
    });
    const unsubSettings = junction().settings.subscribe(setSettings);
    const unsubAuth = junction().auth.subscribe(setAuth);
    return () => {
      cancelled = true;
      unsubSettings();
      unsubAuth();
    };
  }, []);

  const handleAutoLaunchChange = (value: boolean) => {
    setSettings((s) => ({ ...s, autoLaunch: value }));
    void junction().settings.set({ autoLaunch: value });
  };

  const handleSignOut = async () => {
    setSigningOut(true);
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
            Account und allgemeines App-Verhalten. Browser-Auswahl und Sync-Intervall folgen in PROJ-8.
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
              <li>– Browser-Auswahl pro Sync (PROJ-8)</li>
              <li>– Auto-Sync-Intervall (PROJ-7 / PROJ-8)</li>
              <li>– Notification bei Fehlern (PROJ-7)</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
