'use client';

import { useCallback } from 'react';
import { ArrowRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { SafariPermissionCard } from '@/components/safari-permission-card';
import { junction } from '@/lib/electron-bridge';

export default function SafariPermissionsPage() {
  const continueToApp = useCallback(async () => {
    await junction().window.showMain();
  }, []);

  const skip = useCallback(async () => {
    // User chose to skip Safari for now. Junction continues; the sync engine
    // will mark Safari as not configured and surface it again from settings.
    await junction().window.showMain();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8 py-16">
      <div className="flex flex-col items-center gap-3">
        <BrandMark size={48} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Letzter Schritt</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Junction kann Chrome, Firefox und die anderen Browser sofort syncen. Für Safari
          brauchen wir noch eine Berechtigung von dir.
        </p>
      </div>

      <div className="mt-10">
        <SafariPermissionCard onGranted={continueToApp} />
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button onClick={continueToApp} className="gap-2">
          Weiter zu Junction
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" onClick={skip} className="gap-2">
          <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
          Safari überspringen, später erteilen
        </Button>
      </div>
    </div>
  );
}
