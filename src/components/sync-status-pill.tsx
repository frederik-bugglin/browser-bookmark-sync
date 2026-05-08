'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncStatus } from '@/lib/types';

type Props = {
  status: SyncStatus;
  lastSyncAt: string | null;
  className?: string;
};

const COPY: Record<SyncStatus, { label: string; tone: string }> = {
  idle: { label: 'Bereit', tone: 'bg-muted text-muted-foreground' },
  running: { label: 'Synchronisiert…', tone: 'bg-primary/10 text-primary' },
  success: { label: 'Aktuell', tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  error: { label: 'Fehler', tone: 'bg-destructive/10 text-destructive' },
  'skipped-offline': {
    label: 'Offline',
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
};

export function SyncStatusPill({ status, lastSyncAt, className }: Props) {
  const { label, tone } = COPY[status];
  const subline = formatLastSync(status, lastSyncAt);

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          tone,
        )}
      >
        {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
        {label}
      </span>
      {subline && <span className="text-xs text-muted-foreground">{subline}</span>}
    </div>
  );
}

function formatLastSync(status: SyncStatus, lastSyncAt: string | null): string {
  if (status === 'running') return '';
  if (!lastSyncAt) return 'noch nie synchronisiert';
  const date = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  return date.toLocaleDateString('de-CH');
}
