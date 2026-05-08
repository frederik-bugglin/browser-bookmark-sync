'use client';

import { Check, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrowsers } from '@/hooks/use-browsers';
import type { BrowserStatus } from '@/lib/types';

export function BrowserListCompact({
  browsers,
}: {
  browsers?: BrowserStatus[];
}) {
  const live = useBrowsers();
  // Show acknowledged browsers — the "Neu erkannt"-flow lives in Settings.
  const data = browsers ?? live.filter((b) => b.acknowledged);
  return (
    <ul className="flex flex-col gap-1.5">
      {data.map((browser) => (
        <li
          key={browser.id}
          className={cn(
            'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
            !browser.installed && 'opacity-40',
          )}
        >
          <span className="font-medium">{browser.name}</span>
          <span className="flex items-center gap-2 text-xs">
            {browser.installed ? (
              browser.permissionsOk && browser.enabled ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-muted-foreground">aktiv</span>
                </>
              ) : !browser.permissionsOk ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Permission fehlt</span>
                </>
              ) : (
                <>
                  <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">aus</span>
                </>
              )
            ) : (
              <span className="text-muted-foreground">nicht installiert</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
