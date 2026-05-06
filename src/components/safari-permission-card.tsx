'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { junction } from '@/lib/electron-bridge';
import type { PermissionStatus } from '@/lib/types';

type Props = {
  onGranted?: () => void;
};

type ProbeState = { state: 'idle' } | { state: 'probing' } | { state: 'opening-settings' };

export function SafariPermissionCard({ onGranted }: Props) {
  const [status, setStatus] = useState<PermissionStatus>('unknown');
  const [probe, setProbe] = useState<ProbeState>({ state: 'probing' });

  useEffect(() => {
    let cancelled = false;
    void junction()
      .permissions.probeSafari()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setProbe({ state: 'idle' });
        if (s === 'granted') onGranted?.();
      });
    const unsubscribe = junction().permissions.subscribe((p) => {
      setStatus(p.safari);
      if (p.safari === 'granted') onGranted?.();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [onGranted]);

  const openSettings = async () => {
    setProbe({ state: 'opening-settings' });
    await junction().permissions.openSafariSettings();
    setProbe({ state: 'idle' });
  };

  const reprobe = async () => {
    setProbe({ state: 'probing' });
    const next = await junction().permissions.probeSafari();
    setStatus(next);
    setProbe({ state: 'idle' });
    if (next === 'granted') onGranted?.();
  };

  return (
    <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          {status === 'granted' ? (
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Safari benötigt Vollzugriff</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Apple legt Safari-Bookmarks an einer geschützten Stelle ab. Damit Junction sie lesen
            und schreiben kann, brauchst du einmalig die Berechtigung &laquo;Festplattenvollzugriff&raquo;
            für Junction.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Du erteilst sie in den Systemeinstellungen unter <span className="font-medium text-foreground">Datenschutz &amp; Sicherheit</span>.
          </p>
        </div>
      </div>

      <ol className="mt-6 ml-1 space-y-3 text-sm text-muted-foreground">
        <Step n={1}>Klick auf &laquo;Systemeinstellungen öffnen&raquo;</Step>
        <Step n={2}>Aktiviere den Schalter neben Junction</Step>
        <Step n={3}>Komm zurück und klick &laquo;Erneut prüfen&raquo;</Step>
      </ol>

      {status === 'granted' ? (
        <div className="mt-6 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Erteilt. Safari ist bereit für den Sync.</span>
        </div>
      ) : null}

      {status === 'unavailable' ? (
        <div className="mt-6 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Safari ist nicht installiert oder hat noch kein Profil — überspringen.</span>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          onClick={openSettings}
          disabled={probe.state !== 'idle' || status === 'granted' || status === 'unavailable'}
          className="gap-2"
        >
          {probe.state === 'opening-settings' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Öffnet…
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Systemeinstellungen öffnen
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={reprobe}
          disabled={probe.state !== 'idle'}
          className="gap-2"
        >
          {probe.state === 'probing' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Prüft…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Erneut prüfen
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
