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
    // Register the subscribe listener FIRST so any 'browsers:changed' broadcast
    // emitted by refresh() lands in our handler. If subscribe() came after
    // refresh(), a fast broadcast could slip past an unregistered listener and
    // leave the post-login first paint empty.
    const unsub = junction().browsers.subscribe((list) => {
      if (!cancelled) setBrowsers(list);
    });
    void junction().browsers.list().then((list) => {
      if (!cancelled) setBrowsers(list);
    });
    void junction().browsers.refresh();
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
