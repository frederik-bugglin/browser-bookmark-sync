'use client';

import { useEffect, useState } from 'react';
import { junction } from '@/lib/electron-bridge';
import type { BrowserStatus } from '@/lib/types';

// Subscribes to the main-process browsers service. Triggers a fresh detection
// on mount AND on window focus so newly-installed (or freshly-permission-
// granted) browsers light up without a manual reload. The mount-refresh
// matters when the settings window is opened via the tray icon — no focus
// event fires in that path.
export function useBrowsers(): BrowserStatus[] {
  const [browsers, setBrowsers] = useState<BrowserStatus[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Cached list for an instant first paint, then a real detection refresh.
    void junction().browsers.list().then((list) => {
      if (!cancelled) setBrowsers(list);
    });
    void junction().browsers.refresh();
    const unsub = junction().browsers.subscribe(setBrowsers);
    const onFocus = () => {
      void junction().browsers.refresh();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    return () => {
      cancelled = true;
      unsub();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, []);

  return browsers;
}
