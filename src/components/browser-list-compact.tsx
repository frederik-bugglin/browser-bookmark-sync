'use client';

import { Check, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BrowserStatus } from '@/lib/types';

const PLACEHOLDER_BROWSERS: BrowserStatus[] = [
  { id: 'chrome', name: 'Chrome', installed: true, detected: true, permissionsOk: true, enabled: true },
  { id: 'safari', name: 'Safari', installed: true, detected: false, permissionsOk: false, enabled: true },
  { id: 'firefox', name: 'Firefox', installed: true, detected: true, permissionsOk: true, enabled: true },
  { id: 'arc', name: 'Arc', installed: true, detected: true, permissionsOk: true, enabled: true },
  { id: 'brave', name: 'Brave', installed: false, detected: false, permissionsOk: true, enabled: false },
  { id: 'edge', name: 'Edge', installed: false, detected: false, permissionsOk: true, enabled: false },
  { id: 'zen', name: 'Zen', installed: false, detected: false, permissionsOk: true, enabled: false },
  { id: 'dia', name: 'Dia', installed: false, detected: false, permissionsOk: true, enabled: false },
];

export function BrowserListCompact({
  browsers = PLACEHOLDER_BROWSERS,
}: {
  browsers?: BrowserStatus[];
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {browsers.map((browser) => (
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
