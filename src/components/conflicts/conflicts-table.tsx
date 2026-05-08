'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BrowserId, ConflictEntry, ConflictStatus } from '@/lib/types';

const BROWSER_NAMES: Record<BrowserId, string> = {
  chrome: 'Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  arc: 'Arc',
  brave: 'Brave',
  edge: 'Edge',
  zen: 'Zen',
  dia: 'Dia',
};

export function ConflictsTable({
  entries,
  onSelect,
}: {
  entries: ConflictEntry[];
  onSelect: (entry: ConflictEntry) => void;
}) {
  return (
    <div className="rounded-md border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Datum</TableHead>
            <TableHead className="w-24">Winner</TableHead>
            <TableHead className="w-24">Loser</TableHead>
            <TableHead>Bookmark</TableHead>
            <TableHead className="w-32">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow
              key={e.id}
              className="cursor-pointer"
              onClick={() => onSelect(e)}
            >
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(e.createdAt)}
              </TableCell>
              <TableCell className="text-sm">{BROWSER_NAMES[e.winnerBrowserId]}</TableCell>
              <TableCell className="text-sm">{BROWSER_NAMES[e.loserBrowserId]}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-tight">
                    {e.winnerVersion.title || '(ohne Titel)'}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {e.winnerVersion.url}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={e.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: ConflictStatus }) {
  if (status === 'open') {
    return <Badge>Offen</Badge>;
  }
  if (status === 'restored') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
      >
        Wiederhergestellt
      </Badge>
    );
  }
  return <Badge variant="secondary">Erledigt</Badge>;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('de-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}
