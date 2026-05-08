'use client';

import { useEffect, useState } from 'react';

export function useNextSyncLabel(nextScheduledSyncAt: string | null): string | null {
  const [, force] = useState(0);

  useEffect(() => {
    if (!nextScheduledSyncAt) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [nextScheduledSyncAt]);

  return formatNextSync(nextScheduledSyncAt);
}

function formatNextSync(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'gleich';
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin <= 1) return 'in 1 Min';
  if (diffMin < 60) return `in ${diffMin} Min`;
  const diffH = Math.round(diffMin / 60);
  return diffH === 1 ? 'in 1 Std' : `in ${diffH} Std`;
}
